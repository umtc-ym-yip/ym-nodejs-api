const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS, timestampToYMDHIS2 } = require('../time');
const { dailyAdd, gettoDB } = require('../daily/dailyFunc');
const { mysqlConnection, queryFunc } = require('../mysql');
const { poolAcme, poolDc, poolNCN } = require('../mssql');
const { configFunc } = require('../config');
const { validate } = require('node-cron');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

const skipProdClassAry=['test chip for Ips'];
const skipProdClassStr=`AND ProdClass NOT IN ('${skipProdClassAry.join("','")}')`;


router.get('/wipdata/:st/:et', (req, res) => {
    const { st, et } = req.params; ///時間戳

    const sqlStr = `SELECT 
    ProdClass, 
    PartNo,
    Rev,
    LotNum,
    LayerName,
    NumOfLayer,
    LotType,
    Qnty,
    RLSCount,
    ScrapCount,
    proccode,
    ProcName,
    ProcNameE,
    BefStatus,
    AftStatus,
    ChangeTime,
    VET,
    procGroup,
    layerGroup FROM ym_wip WHERE procGroup<>'' 
    AND ChangeTime BETWEEN 
    '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
    AND Qnty<>'0' ${skipProdClassStr}`;

    mysqlConnection(configFunc('wip'))
        .then((connection) => {
            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        });
});


router.get('/wiptemplate/:partno/:rev', (req, res) => {

    const ABFplusAry = ['ABFCLN', 'ABFNOV', 'ABFNCL', 'ABFCPO', 'ABFCZO', 'ABFPOS', 'ABFPTO', 'ABFPVC', 'ABFMEC', 'ABFBZO', 'ABFIPW', 'ABFMPO', 'ABFABF'];
    const CoreexceptionAry = ['AOI1VRS1', 'LDL1PLF1', 'LDL1COL1', 'PTH7SAC1', 'AOI1AOS1'];
    const { partno, rev } = req.params;
    console.log(partno,rev);
    mysqlConnection(configFunc('wip'))
        .then((connection) => {

            const sqlControl = `SELECT * FROM process_control`;

            const sqlPath = `SELECT DISTINCT LEFT(m.PartNum,7)PartNum,m.Revision,m.Layer,RTRIM(l.LayerName)LayerName,d.NumOfLayer, m.SerialNum, p.ProcName ProcNameS, 
    left(p.ProcName,3) + CAST(m.Degree as char(1)) + right(p.ProcName,3) + CAST(m.Times as char(1)) ProcNameE, p.Decision from V_PnumProcRouteDtl(nolock) m
    INNER JOIN NumofLayer l(nolock) on m.layer = l.Layer 
    INNER JOIN ProcBasic p(nolock) on m.proccode = p.ProcCode
    INNER JOIN prodbasic d(nolock) ON m.PartNum=d.PartNum AND m.Revision=d.Revision AND m.Layer=d.Layer
    where m.PartNum='${partno}' AND m.Revision='${rev}'`;

            return Promise.all([queryFunc(connection, sqlControl), poolAcme.query(sqlPath)])
        })
        .then((result) => {
            // res.json(result);
            const controlData = result[0];
            const wipData = result[1].recordset;

            const myAry = [];

            wipData.forEach((i) => {
                const Obj = {};

                // 補上SerialNum
                Obj.SerialNum = i.SerialNum;
                // 

                if (i.LayerName !== '-Outer') {
                    const layerAry = i.LayerName.split('L');
                    Obj.NumOfLayer = ((Number(layerAry[2]) - Number(layerAry[1])) + 1) / 2;
                } else {
                    Obj.NumOfLayer = Number(i.NumOfLayer/2);
                };

                const idx = controlData.findIndex((d) => {

                    if (d.pcode.length === 6) {
                        return d.pcode === i.ProcNameS
                    } else if (d.pcode.length === 8) {
                        return d.pcode === i.ProcNameE
                    };
                });

                if (idx !== -1) {

                    if (i.ProcNameS === 'ABFCLN' && i.LayerName === '-Outer') {///ABFCLN 如果層別不在Outer，則歸類在ABF，反之則SMK
                        Obj.procGroup = 'SMK';
                        Obj.lgroup = 'SMK';
                    } else if (i.ProcNameS === 'ABFCLN' && i.LayerName !== '-Outer') {
                        Obj.procGroup = 'ABF';
                        Obj.lgroup = 'BU-Outer';
                    } else {
                        Obj.procGroup = controlData[idx].pgroup;
                        Obj.lgroup = controlData[idx].lgroup;
                    }

                    // 處理PTHIPQ Core和BU-Outer都有問題 OK!
                    if (i.ProcNameS === 'PTHIPQ' && Obj.NumOfLayer>1) {
                        Obj.procGroup = 'AOI';
                        Obj.lgroup = 'BU-Outer';
                    } else if (i.ProcNameS === 'PTHIPQ' && Obj.NumOfLayer===1) {
                        Obj.procGroup = 'AOI';
                        Obj.lgroup = 'Core';
                    }

                    // 處理LayerGroup OK!
                    if ((Obj.lgroup === 'BU-Outer' || Obj.lgroup === 'BU') && i.LayerName === '-Outer') {//排除BE SMK
                        // Obj.layerGroup = Obj.lgroup;
                        Obj.layerGroup=`BU${Obj.NumOfLayer - 1}`;
                    } else if (Obj.lgroup === 'BU-Outer' || Obj.lgroup === 'BU') {

                        const layerAry = i.LayerName.split('L');

                        if (ABFplusAry.includes(i.ProcNameS) && layerAry[1] === '2') {///ABF站點且-L2
                            // Obj.layerGroup = 'BU-Outer';
                            Obj.layerGroup = `BU${Obj.NumOfLayer - 1}`;
                        } else if (ABFplusAry.includes(i.ProcNameS) && layerAry[1] !== '2') {///ABF站點但非-L2
                            Obj.layerGroup = `BU${Obj.NumOfLayer}`;
                        } else if (CoreexceptionAry.includes(i.ProcNameE) && Obj.NumOfLayer === 1) {///Core 例外站點 雷爆@@
                            Obj.layerGroup = 'Core';
                        } else {
                            Obj.layerGroup = `BU${Obj.NumOfLayer - 1}`;
                        };

                    } else {///BE SMK
                        Obj.layerGroup = Obj.lgroup;
                    };

                    const checkExist = myAry.filter((i) =>
                        i.procGroup === Obj.procGroup
                        && i.layerGroup === Obj.layerGroup
                    ).length

                    const skipProcNameS = ['LTHCLN'];

                    checkExist === 0 && !(skipProcNameS.includes(i.ProcNameS) && i.LayerName === '-Outer')
                        ? myAry.push(Obj)
                        : true;
                }
            });

            myAry.sort((a, b) => {
                if (a.NumOfLayer < b.NumOfLayer) return -1;
                if (a.NumOfLayer > b.NumOfLayer) return 1;
                return a.SerialNum - b.SerialNum
            });

            res.json(myAry);
        })
        .catch((err) => {
            console.log(err);
        })
});


const allowAry = ['A0683','A1649'];
const isLotFormat = (lot,otd) => {
    const regex = /^[A-Z0-9]{8}-[A-Z0-9]{2}-[A-Z0-9]{2}$/;
    return regex.test(lot)&&otd!==undefined
};


router.post('/otdupdate/:uid', (req, res) => {
    const { uid } = req.params;
    const updateData = req.body;

    if (!allowAry.includes(uid)) {
        res.json({ message: '權限不足，請向YIP申請權限', status: false });
        return
    };

    const falseIdx = updateData.map((i) => isLotFormat(i.lot,i.otd)).findIndex((d) => d === false);
    if (falseIdx !== -1) {
        res.json({ message: `第${falseIdx + 1}列格式不正確，請重新確認後上傳`, status: false });
        return
    };


    mysqlConnection(configFunc('wip'))
        .then((connection) => {
            const updateStr = `${updateData.map((i) => `('${i.lot}','${i.otd}','${i.time}','${i.uid}')`)}`;

            const sqlStr = `INSERT INTO otd_record(lot, otd,time,uid) VALUES ${updateStr}`;
            // ON DUPLICATE KEY UPDATE lot=VALUES(lot)
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json({ message: '上傳完成', status: true });
        })
        .catch((err) => {
            res.json({ message: '上傳失敗', status: false });
            console.log(err);
        })
});

router.get('/otddata', (req, res) => {
    mysqlConnection(configFunc('wip'))
        .then((connection) => {

            const sqlStr = `SELECT t1.lot,t1.otd,t1.time,t1.uid FROM otd_record t1
            INNER JOIN 
            (SELECT lot,MAX(time)time FROM otd_record GROUP BY lot)t2
            ON t1.lot=t2.lot AND t1.time=t2.time
            `;

            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.post('/otdupdate/:lot/:otd/:time/:uid', (req, res) => {
    const { lot, otd, time, uid } = req.params;


    if (!allowAry.includes(uid)) {
        res.json({ message: '權限不足，請向YIP申請權限', status: false });
        return
    }
    mysqlConnection(configFunc('wip'))
        .then((connection) => {

            // const sqlStr=`UPDATE otd_record SET ${column}='${columndata}',time='${time}' WHERE lot=${lot}`;
            const sqlStr = `INSERT INTO otd_record(lot, otd, time, uid) 
        VALUES ('${lot}','${otd}','${time}','${uid}')`;

            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            res.json({ message: '更新完成', status: true });
        })
        .catch((err) => {
            res.json({ message: '更新失敗', status: false });
            console.log(err);
        });
});

router.get('/ultscrap/:lot', (req, res) => {
    const { lot } = req.params;
    const sqlStr = `SELECT ScrappedSource,Count(*)Count FROM YM_ULT_UnitBase(nolock) 
    WHERE LotNum='${lot}' GROUP BY ScrappedSource HAVING ScrappedSource<>''`
    poolDc.query(sqlStr)
        .then((result) => {
            res.json(result.recordset)
        })
        .catch((err) => {
            console.log(err);
        })
});

router.post('/wipalltemplate/:st/:et', (req, res) => {
    const { st, et } = req.params; ///時間戳

    const { data } = req.body;

    let partFilerStr = '';

    if (data) {
        partFilerStr = `AND LEFT (PartNo,7) IN ('${data.join("','")}')`;
    };

    const ABFplusAry = ['ABFCLN', 'ABFNOV', 'ABFNCL', 'ABFCPO', 'ABFCZO', 'ABFPOS', 'ABFPTO', 'ABFPVC', 'ABFMEC', 'ABFBZO', 'ABFIPW', 'ABFMPO', 'ABFABF'];
    const CoreexceptionAry = ['AOI1VRS1', 'LDL1PLF1', 'LDL1COL1', 'PTH7SAC1', 'AOI1AOS1'];
    let controlData = [];
    mysqlConnection(configFunc('wip'))
        .then((connection) => {

            const sqlStr = `SELECT PartNo,Rev 
            FROM ym_wip WHERE 
            procGroup<>''
            ${partFilerStr}
            AND ChangeTime BETWEEN
            '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
            AND Qnty<>'0'`;

            const sqlControl = `SELECT * FROM process_control`;

            return Promise.all([queryFunc(connection, sqlStr), queryFunc(connection, sqlControl)])
        })
        .then((result) => {

            controlData = result[1];
            const partrevStr = [...new Set(result[0].map((i) => `${i.PartNo}-${i.Rev}`))]
                .map((i) => {
                    const data = i.split('-');
                    return `(m.PartNum='${data[0]}' AND m.Revision='${data[1]}')`
                })
                .join(' OR ');

            

            const sqlPath = `With dt As(SELECT DISTINCT LEFT(m.PartNum,7)PartNum,m.Revision,m.Layer,RTRIM(l.LayerName)LayerName,d.NumOfLayer, m.SerialNum, p.ProcName ProcNameS, 
            left(p.ProcName,3) + CAST(m.Degree as char(1)) + right(p.ProcName,3) + CAST(m.Times as char(1)) ProcNameE, p.Decision from V_PnumProcRouteDtl(nolock) m
            INNER JOIN NumofLayer l(nolock) on m.layer = l.Layer 
            INNER JOIN ProcBasic p(nolock) on m.proccode = p.ProcCode
            INNER JOIN prodbasic d(nolock) ON m.PartNum=d.PartNum AND m.Revision=d.Revision AND m.Layer=d.Layer
            where ${partrevStr})
        
            SELECT * FROM dt WHERE PartNum IN (SELECT top 1 PartNum FROM dt GROUP BY PartNum,Revision ORDER BY Count(*) DESC ) AND Revision IN (SELECT top 1 Revision FROM dt GROUP BY PartNum,Revision ORDER BY Count(*) DESC)`;

            return poolAcme.query(sqlPath)
        })
        .then((result) => {

            const wipData = result.recordset;

            const myAry = [];

            wipData.forEach((i) => {
                const Obj = {};

                // 補上SerialNum
                Obj.SerialNum = i.SerialNum;
                // 

                if (i.LayerName !== '-Outer') {
                    const layerAry = i.LayerName.split('L');
                    Obj.NumOfLayer = ((Number(layerAry[2]) - Number(layerAry[1])) + 1) / 2;
                } else {
                    Obj.NumOfLayer = Number(i.NumOfLayer / 2);
                };

                const idx = controlData.findIndex((d) => {

                    if (d.pcode.length === 6) {
                        return d.pcode === i.ProcNameS
                    } else if (d.pcode.length === 8) {
                        return d.pcode === i.ProcNameE
                    };
                });

                if (idx !== -1) {

                    if (i.ProcNameS === 'ABFCLN' && i.LayerName === '-Outer') {///ABFCLN 如果層別不在Outer，則歸類在ABF，反之則SMK
                        Obj.procGroup = 'SMK';
                        Obj.lgroup = 'SMK';
                    } else if (i.ProcNameS === 'ABFCLN' && i.LayerName !== '-Outer') {
                        Obj.procGroup = 'ABF';
                        Obj.lgroup = 'BU-Outer';
                    } else {
                        Obj.procGroup = controlData[idx].pgroup;
                        Obj.lgroup = controlData[idx].lgroup;
                    }

                    // 處理PTHIPQ Core和BU-Outer都有問題 OK!
                    if (i.ProcNameS === 'PTHIPQ' && Obj.NumOfLayer > 1) {
                        Obj.procGroup = 'AOI';
                        Obj.lgroup = 'BU-Outer';
                    } else if (i.ProcNameS === 'PTHIPQ' && Obj.NumOfLayer === 1) {
                        Obj.procGroup = 'AOI';
                        Obj.lgroup = 'Core';
                    }

                    // 處理LayerGroup OK!
                    if ((Obj.lgroup === 'BU-Outer' || Obj.lgroup === 'BU') && i.LayerName === '-Outer') {//排除BE SMK
                        // Obj.layerGroup = Obj.lgroup;
                        Obj.layerGroup = `BU${Obj.NumOfLayer - 1}`;
                    } else if (Obj.lgroup === 'BU-Outer' || Obj.lgroup === 'BU') {

                        const layerAry = i.LayerName.split('L');

                        if (ABFplusAry.includes(i.ProcNameS) && layerAry[1] === '2') {///ABF站點且-L2
                            // Obj.layerGroup = 'BU-Outer';
                            Obj.layerGroup = `BU${Obj.NumOfLayer - 1}`;
                        } else if (ABFplusAry.includes(i.ProcNameS) && layerAry[1] !== '2') {///ABF站點但非-L2
                            Obj.layerGroup = `BU${Obj.NumOfLayer}`;
                        } else if (CoreexceptionAry.includes(i.ProcNameE) && Obj.NumOfLayer === 1) {///Core 例外站點 雷爆@@
                            Obj.layerGroup = 'Core';
                        } else {
                            Obj.layerGroup = `BU${Obj.NumOfLayer - 1}`;
                        };

                    } else {///BE SMK
                        Obj.layerGroup = Obj.lgroup;
                    };

                    const checkExist = myAry.filter((i) =>
                        i.procGroup === Obj.procGroup
                        && i.layerGroup === Obj.layerGroup
                    ).length

                    const skipProcNameS = ['LTHCLN'];

                    checkExist === 0 && !(skipProcNameS.includes(i.ProcNameS) && i.LayerName === '-Outer')
                        ? myAry.push(Obj)
                        : true;
                }
            });

            myAry.sort((a, b) => {
                if (a.NumOfLayer < b.NumOfLayer) return -1;
                if (a.NumOfLayer > b.NumOfLayer) return 1;
                return a.SerialNum - b.SerialNum
            });

            res.json(myAry);
        })
        .catch((err) => {
            console.log(err);
        })
});


router.get('/wipfilterdata/:time/:st/:et', (req, res) => {
    const { time, st, et } = req.params;

    const ABFplusAry = ['ABFCLN', 'ABFNOV', 'ABFNCL', 'ABFCPO', 'ABFCZO', 'ABFPOS', 'ABFPTO', 'ABFPVC', 'ABFMEC', 'ABFBZO', 'ABFIPW', 'ABFMPO', 'ABFABF'];
    const CoreexceptionAry = ['AOI1VRS1', 'LDL1PLF1', 'LDL1COL1', 'PTH7SAC1', 'AOI1AOS1'];

    mysqlConnection(configFunc('wip'))
        .then((connection) => {
            const filterwipStr = `With dt As (SELECT lotnum,Max(ChangeTime)Time FROM PDL_CKhistory a(nolock) WHERE ChangeTime<='${timestampToYMDHIS2(Number(time))}' GROUP BY lotnum)

            SELECT DISTINCT
            CASE WHEN d.ProdClass IS NULL THEN ''
            WHEN d.ProdClass ='APD' THEN 'OSAT' 
            
            ELSE d.ProdClass END ProdClass,
            RTRIM(h.partnum)PartNo,
            RTRIM(h.revision)Rev,
            RTRIM(h.lotnum)LotNum,
            RTRIM(f.LayerName)LayerName,
            d.NumOfLayer,
            t.ITypeName LotType,
            h.Qnty_S Qnty,
            h.proccode,
            b.ProcName,
            LEFT(b.ProcName,3)+CAST(h.BefDegree AS CHAR(1))+RIGHT(b.ProcName,3)+CAST(h.BefTimes AS CHAR(1))ProcNameE,
            h.BefStatus,
            h.AftStatus,
            CONVERT(VARCHAR, h.ChangeTime, 120)ChangeTime
            FROM PDL_CKhistory h(nolock)
            INNER JOIN dt ON h.lotnum=dt.lotnum AND h.ChangeTime=dt.Time
            INNER JOIN procbasic b(nolock) ON h.proccode = b.ProcCode 
            INNER JOIN numoflayer f(nolock) ON h.layer = f.Layer
            INNER JOIN ClassIssType t(nolock) ON h.isstype=t.ITypeCode
            INNER JOIN prodbasic d(nolock) ON h.partnum=d.PartNum AND h.revision=d.Revision AND h.layer=d.Layer
            WHERE LEFT(h.partnum,2)<>'UM' AND ChangeTime BETWEEN 
            '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}' AND h.Qnty_S<>'0' ${skipProdClassStr}`;

            const sqlControl = `SELECT * FROM process_control`;

            return Promise.all([poolAcme.query(filterwipStr), queryFunc(connection, sqlControl)])
        })
        .then((result) => {

            const wipData = result[0].recordset;

            const controlData = result[1];

            wipData.forEach((i, index) => {

                if (i.LayerName !== '-Outer') {
                    const layerAry = i.LayerName.split('L');
                    i.NumOfLayer = ((Number(layerAry[2]) - Number(layerAry[1])) + 1) / 2;
                }
                else {
                    i.NumOfLayer = Number(i.NumOfLayer / 2);///表示Outer
                };

                const idx = controlData.findIndex((d) => {

                    if (d.pcode.length === 6) {
                        return d.pcode === i.ProcName
                    } else if (d.pcode.length === 8) {
                        return d.pcode === i.ProcNameE
                    };
                });

                if (idx !== -1) {///ABFCLN 如果層別不在Outer，則歸類在ABF，反之則SMK
                    if (i.ProcName === 'ABFCLN' && i.LayerName === '-Outer') {
                        i.procGroup = 'SMK';
                        i.lgroup = 'SMK';
                    } else if (i.ProcName === 'ABFCLN' && i.LayerName !== '-Outer') {
                        i.procGroup = 'ABF';
                        i.lgroup = 'BU-Outer';
                    } else {
                        i.procGroup = controlData[idx].pgroup;
                        i.lgroup = controlData[idx].lgroup;
                    }

                    if (i.ProcName === 'PTHIPQ' && i.NumOfLayer > 1) {
                        i.procGroup = 'AOI';
                        i.lgroup = 'BU-Outer';
                    } else if (i.ProcName === 'PTHIPQ' && i.NumOfLayer === 1) {
                        i.procGroup = 'AOI';
                        i.lgroup = 'Core';
                    }

                    // PTHIPQ   AOI Core
                    // PTHIPQ   AOI BU-Outer


                    if ((i.lgroup === 'BU-Outer' || i.lgroup === 'BU') && i.LayerName === '-Outer') {//排除BE SMK
                        // i.layerGroup = i.lgroup; 原本
                        i.layerGroup = `BU${i.NumOfLayer - 1}`;
                    } else if (i.lgroup === 'BU-Outer' || i.lgroup === 'BU') {

                        const layerAry = i.LayerName.split('L');

                        // i.layerGroup = ABFplusAry.includes(i.ProcName) && layerAry[1] === '2'
                        //     ? `BU-Outer`
                        //     : ABFplusAry.includes(i.ProcName) && layerAry[1] !== '2'
                        //         ? `BU${i.NumOfLayer}`  ///除了ABFplusAry中的，其他都應該-1 ex BU1->2FB ,BU2->3FB(L3L8)
                        //         : `BU${i.NumOfLayer - 1}`;
                        if (ABFplusAry.includes(i.ProcName) && layerAry[1] === '2') {///ABF站點且-L2
                            // i.layerGroup = 'BU-Outer';原本
                            i.layerGroup = `BU${i.NumOfLayer - 1}`;
                        } else if (ABFplusAry.includes(i.ProcName) && layerAry[1] !== '2') {///ABF站點但非-L2
                            i.layerGroup = `BU${i.NumOfLayer}`;
                        } else if (CoreexceptionAry.includes(i.ProcNameE) && i.NumOfLayer === 1) {///Core 例外站點 雷爆@@
                            i.layerGroup = 'Core';
                        } else {
                            i.layerGroup = `BU${i.NumOfLayer - 1}`;
                        };
                    } else {///BE SMK
                        i.layerGroup = i.lgroup;
                    };

                }
                else {///沒有比對到的
                    i.procGroup = '';
                    i.lgroup = '';
                    i.layerGroup = '';
                };
            });

            res.json(wipData);
        })
        .catch((err) => {
            console.log(err);
        });
})





module.exports = router;
