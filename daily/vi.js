const express = require('express');
const sql = require('mssql');
const fs = require('fs');
const XLSX = require('xlsx');

const { timestampToYMDHIS, timestampToYMDHIS2 } = require('../time');

const { dailyAdd, gettoDB } = require('../daily/dailyFunc');
const { mysqlConnection, queryFunc } = require('../mysql');
const { poolAcme, poolDc, poolNCN, poolMetrology } = require('../mssql');
const { configFunc } = require('../config');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

const configSPC = {
    server: '10.22.65.134',
    user: 'ymyip',
    password: '5CQPBcyE',
    database: 'SPC_Unimicron',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 3000000
    },
    pool: {
        max: 10000,
        min: 0,
        idleTimeoutMillis: 3000000
    }
};

const configAcme = {
    server: '10.22.65.120',
    user: 'dc',
    password: 'dc',
    database: 'acme',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 300000
    }
};

const configDc = {
    server: '10.22.65.120',
    user: 'dc',
    password: 'dc',
    database: 'dc',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 300000
    },
    pool: {
        max: 10000,
        min: 0,
        idleTimeoutMillis: 3000000
    }
};

const configMetrology = {
    server: '10.22.66.37',
    user: 'ymyip',
    password: 'pr&rZw93',
    database: 'YM_Metrology',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 3000000
    },
    pool: {
        max: 10000,
        min: 0,
        idleTimeoutMillis: 3000000
    }
};
router.get('/daily', (req, res) => {
    const curDate = new Date()
    curDate.setHours(8, 0, 0, 0);
    curDate.setDate(curDate.getDate() + 1);
    const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    curDate.setDate(curDate.getDate() - 20);
    curDate.setHours(8, 0, 0, 0);
    const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    const sqlCVI = `SELECT DISTINCT  
    CONVERT(VARCHAR,a.ChangeTime,120) ChangeTime,
    CASE WHEN f.ProdClass='APD' THEN 'OSAT' ELSE f.ProdClass END ProdClass,
    LEFT(a.partnum,7) PartNum,
    a.lotnum LotNum,
    d.ITypeName LotType
    FROM PDL_CKhistory a(nolock) 
    LEFT JOIN Numoflayer c(nolock) ON a.layer = c.Layer
    LEFT JOIN ClassIssType d(nolock) ON a.isstype = d.ITypeCode
    LEFT JOIN ProdBasic f(nolock) ON a.partnum=f.PartNum AND a.revision=f.Revision
    WHERE proccode IN ('FVI42')
    AND AftStatus='CheckOut'
    AND aftlottype<>'重工帳'
    AND LEFT(d.ITypeName,2)<>'E3'
    AND IsCancel IS NULL
    AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'`;
    // 取得CVI產出(IPQC->CVI(v))
    // console.log(sqlCVI)
    const sqlIPQC = `SELECT DISTINCT  
    CONVERT(VARCHAR,a.ChangeTime,120) ChangeTime,
    CASE WHEN f.ProdClass='APD' THEN 'OSAT' ELSE f.ProdClass END ProdClass,
    LEFT(a.partnum,7) PartNum,
    a.lotnum LotNum,
    d.ITypeName LotType
    FROM PDL_CKhistory a(nolock) 
    LEFT JOIN ClassIssType d(nolock) ON a.isstype = d.ITypeCode
    LEFT JOIN ProdBasic f(nolock) ON a.partnum=f.PartNum AND a.revision=f.Revision
    WHERE proccode IN ('FVI08')
    --AND BefDegree<>'3'
    AND AftStatus='CheckOut'
    AND BefTimes='1'
    AND aftlottype<>'重工帳'
    AND LEFT(d.ITypeName,2)<>'E3'
    AND IsCancel IS NULL
    AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'
    AND a.partnum+a.revision IN (SELECT DISTINCT PartNum+Revision FROM V_PnumProcRouteDtl WHERE ProcCode ='FVI08' AND PartNum+Revision  NOT IN (SELECT PartNum+Revision FROM V_PnumProcRouteDtl WHERE ProcCode ='FVI42'))`

    // 篩選只有IPQC料號，只能在IPQC產出
    let dataAry = []
    let lotAry = []
    let lotStr = ''
    let sumData = []
    return Promise.all([
        poolAcme.query(sqlCVI),
        poolAcme.query(sqlIPQC),
    ])
        .then((result) => {
            // res.json(result)
            dataAry = [...result[0].recordset, ...result[1].recordset]
            // res.json(dataAry)
            lotAry = dataAry.map((i) => i.LotNum)
            lotStr = `'${lotAry.join("','")}'`
            const sqldenoIPQCM = `SELECT DISTINCT a.lotnum LotNum,a.Qnty IPQC_M
            FROM PDL_CKhistory a(nolock)
            LEFT JOIN ProcBasic b(nolock) ON a.proccode = b.ProcCode
            WHERE a.BefStatus='MoveIn'
            AND a.IsCancel is null
            AND a.AftStatus='CheckIn'
            AND SUBSTRING(b.ProcName,1,3)+CAST(BefDegree AS NVARCHAR)+SUBSTRING(b.ProcName,4,3)+CAST(BefTimes AS NVARCHAR) = 'FVI1FVI1'
            AND a.lotnum IN (${lotStr})`
            const sqldenoIPQCT = `SELECT Lot LotNum,Sum(CAST(QUNTY AS REAL))IPQC_T FROM V_YM_IPQC_VI_forYIPDashBoard 
            WHERE Lot IN (${lotStr}) 
            AND Defect_Code LIKE 'T%' 
            AND QUNTY<>'0' GROUP BY Lot`
            const sqldenoVRS1 = `SELECT LotNum,Count(*)VRS1_M FROM 
            (SELECT LotNum,Unit2DID,ROW_NUMBER() OVER (PARTITION BY Unit2DID ORDER BY Side desc) Rank FROM YM_AVI_Dashboard_RawData 
            WHERE ProcCode in('FVI59','FVI06')
            AND LotNum IN (${lotStr}) 
            AND VRS_Scrapped='1' 
            AND VRS_Judge NOT like 'T%') T 
            WHERE Rank='1' GROUP BY LotNum`

            const sqlVRS1 = `SELECT STEPTYPE='VRS1',LOTNO LotNum,DFCOD Defect,QUNTY FROM
            (SELECT LotNum LOTNO,LEFT(PartNum,7)PN,Unit2DID,VRS_JUDGE DFCOD,VRS_SCRAPPED QUNTY,VRS_End_Time,ROW_NUMBER() OVER (PARTITION BY Unit2DID Order BY Side desc) Rank 
            FROM YM_AVI_Dashboard_RawData 
            WHERE LotNum IN (${lotStr})
            AND ProcCode in('FVI59','FVI06')
            AND VRS_Scrapped<>'0'
            AND VRS_Judge NOT LIKE 'T%'
            AND VRS_Scrapped IS NOT NULL)T
            WHERE Rank='1'`

            const sqlIPQCT = `
            SELECT STEPTYPE='IPQC',Lot LotNum,Defect_Code Defect,CAST(QUNTY AS REAL)QUNTY FROM V_YM_IPQC_VI_forYIPDashBoard 
            WHERE Lot IN (${lotStr}) 
            AND Defect_Code NOT LIKE 'T%'
            AND QUNTY<>'0'`;
            // UNION
            // SELECT STEPTYPE='CVI',L.LOTNO LotNum,T.DFCOD Defect,T.QUNTY FROM 
            // (SELECT a.RK01,a.QUNTY,c.DFCOD FROM YS_Multiple_Def_03 a 
            //     INNER JOIN YS_DEFECT_CODE_04 c ON a.RK04=c.RKEY 
            //     WHERE RK01 IN 
            //     (SELECT RKEY FROM YS_Multiple_DATA_01 WHERE LOTNO IN (${lotStr}) AND STEPTYPE='CVI')
            //     AND QUNTY<>'0')T INNER JOIN YS_Multiple_DATA_01 L ON T.RK01=L.RKEY

            const sqlMac = `SELECT DISTINCT RTRIM(lotnum)LotNum,SUBSTRING(b.ProcName,1,3)+CAST(BefDegree as nvarchar)+SUBSTRING(b.ProcName,4,3)+CAST(BefTimes as nvarchar) ProcNameE,
                CASE WHEN e.MachineName IS NULL THEN '' ELSE e.MachineName END MachineName,CONVERT(VARCHAR,ChangeTime,120) ChangeTime 
                FROM PDL_CKhistory a(nolock)
                LEFT JOIN PDL_Machine e(nolock) ON a.Machine = e.machineid
                LEFT JOIN ProcBasic b(nolock) ON a.proccode = b.ProcCode
                WHERE lotnum IN (${lotStr})
                AND AftStatus='CheckOut'
                AND layer='0'`

            return Promise.all([
                poolAcme.query(sqldenoIPQCM),
                poolDc.query(sqldenoIPQCT),
                poolMetrology.query(sqldenoVRS1),
                poolMetrology.query(sqlVRS1),
                poolDc.query(sqlIPQCT),
                poolAcme.query(sqlMac),
            ])
        })
        .then((result) => {
            const ipqcmdenoData = result[0].recordset
            const ipqctdenoData = result[1].recordset
            const vrs1denoData = result[2].recordset
            const vrs1Data = result[3].recordset
            const ipqcData = result[4].recordset
            const machineData = result[5].recordset

            dataAry.forEach((i) => {
                const ipqcmdenoIndex = ipqcmdenoData.findIndex((m) => m.LotNum === i.LotNum);
                if (ipqcmdenoIndex !== -1) {
                    i.IPQC_M = ipqcmdenoData[ipqcmdenoIndex].IPQC_M
                } else {
                    i.IPQC_M = 0
                }
                const ipqctdenoIndex = ipqctdenoData.findIndex((t) => t.LotNum === i.LotNum);
                if (ipqctdenoIndex !== -1) {
                    i.IPQC_T = ipqctdenoData[ipqctdenoIndex].IPQC_T
                } else {
                    i.IPQC_T = 0
                }
                const vrs1denoIndex = vrs1denoData.findIndex((s) => s.LotNum === i.LotNum);
                if (vrs1denoIndex !== -1) {
                    i.VRS1_M = vrs1denoData[vrs1denoIndex].VRS1_M
                } else {
                    i.VRS1_M = 0
                }

                i.denoQty = i.IPQC_M + i.VRS1_M - i.IPQC_T
            });
            // 分母計算完畢
            sumData = [...vrs1Data, ...ipqcData]

            let sumDefectData = []
            // 計算每批的缺點總數
            // 算前三大缺點
            dataAry.forEach((i, idx) => {
                
                const data = sumData.filter((s) => s.LotNum === i.LotNum)
                if (data.length === 0) {
                    i.sumQty = 0
                } else {
                    i.sumQty = data.map((d) => d.QUNTY).reduce((a, b) => a + b, 0)
                }
                i.Yield = (1 - (i.sumQty / i.denoQty)).toFixed(4)
                i.Remark = ''

                const defectAry = [...new Set(data.map((d) => d.Defect))]

                const summaryData = [];
                defectAry.forEach((d) => {
                    const obj = {};
                    const defectCount = data.filter((item) => item.Defect === d).map((item) => item.QUNTY).reduce((a, b) => a + b, 0)
                    obj.LotNum = i.LotNum
                    obj.Defect = d
                    obj.Rate = (defectCount / i.denoQty).toFixed(4)

                    summaryData.push(obj)
                });

                sumDefectData = [...sumDefectData, ...summaryData]

                const top3Data = summaryData.sort((a, b) => Number(b.Rate) - Number(a.Rate)).slice(0, 3);
                // 不足3個則補上空物件

                if (top3Data.length < 3) {
                    let timeRecord = top3Data.length
                    for (let i = 0; i < 3 - timeRecord; i++) {
                        top3Data.push({})
                    }
                }

                top3Data.forEach((t, idx) => {
                    if (Object.keys(t).length === 0) {
                        i[`top${idx + 1}`] = ''
                        i[`top${idx + 1}_rate`] = ''
                    } else {
                        i[`top${idx + 1}`] = t.Defect
                        i[`top${idx + 1}_rate`] = t.Rate
                    }
                })
            })

            res.json(
                {
                    viyielddata: { data: dataAry, db: 'vi', table: 'viyieldv2', match: ['IPQC_M', 'IPQC_T', 'VRS1_M', 'denoQty', 'sumQty', 'Yield', 'ChangeTime', 'top1', 'top1_rate', 'top2', 'top2_rate', 'top3', 'top3_rate'] },
                    videfectdata: { data: sumDefectData, db: 'vi', table: 'videfectv2', match: ['Rate'] },
                    vimachinedata: { data: machineData, db: 'vi', table: 'vimachinev2', match: ['MachineName','ChangeTime'] }
                }
            )
        })
        .catch((err) => {
            console.log(err);
        })

})

router.get('/weeklystack/:day', (req, res) => {
    const {day}=req.params
    const curDate = new Date()
    curDate.setHours(8, 0, 0, 0);
    curDate.setDate(curDate.getDate() - day);
    const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    curDate.setDate(curDate.getDate() - day -1);
    curDate.setHours(8, 0, 0, 0);
    const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);
    console.log(t8sqlTime,l8sqlTime)
    let bincodeAry = [];
    let lotStr = '';
    let dataAry = [];
    const processAry = ['SMK1VDF1', 'SMK1SEP1', 'MDL1MDC1', 'PSP1PTM1', 'PSP1UBL1', 'TST1MPW1', 'PSP2CCM1', 'PSP2DSS1', 'AOI1AEI1', 'AOI1VRS1', 'AOI1AOS1'];

    sql.connect(configDc)
        .then(() => {
            return Promise.all([sql.query(`select max(ChangeTime) ChangeTime,ProdClass,PartNum,Version,LotNum,Lottype,Layer,aftlottype from 
    (select CONVERT(VARCHAR,a.ChangeTime,111)+' '+CONVERT(VARCHAR,a.ChangeTime,108) ChangeTime,f.ProdClass,left(a.partnum,7) PartNum,Concat(right(a.partnum,1),a.revision) as Version, a.lotnum as LotNum, d.ITypeName as [Lottype], c.LayerName as Layer, 
    b.ProcName,e.MachineName,(c.EndLayer-c.FromLayer+1)/2 as [Layer name],aftlottype,a.IsCancel
            from acme.dbo.pdl_ckhistory a(nolock)
            inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
            inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
            inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
            inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
            inner join acme.dbo.prodbasic f(nolock) on a.partnum=f.PartNum and a.revision=f.Revision
            where a.AftStatus='CheckOut'
            and left(d.ITypeName,2) not in ('E3')
            and a.proccode='FVI42'
            and a.ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'
            ) as tdt where aftlottype!='重工帳' and IsCancel is null  group by ProdClass,PartNum,Version,LotNum,Lottype,Layer,aftlottype,IsCancel
            Union
            select max(ChangeTime) ChangeTime,ProdClass,PartNum,Version,LotNum,Lottype,Layer,aftlottype from 
    (select CONVERT(VARCHAR,a.ChangeTime,111)+' '+CONVERT(VARCHAR,a.ChangeTime,108) ChangeTime,f.ProdClass,left(a.partnum,7) PartNum,Concat(right(a.partnum,1),a.revision) as Version, a.lotnum as LotNum, d.ITypeName as [Lottype], c.LayerName as Layer, 
    b.ProcName,e.MachineName,(c.EndLayer-c.FromLayer+1)/2 as [Layer name],aftlottype,a.IsCancel
            from acme.dbo.pdl_ckhistory a(nolock)
            inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
            inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
            inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
            inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
            inner join acme.dbo.prodbasic f(nolock) on a.partnum=f.PartNum and a.revision=f.Revision
            where a.AftStatus='CheckOut'
            and left(d.ITypeName,2) not in ('E3')
            and (ProdClass in ('Server','OSAT') OR LEFT(a.partnum,7) in ('2674014')) and a.BefTimes='1'
            and a.proccode='FVI08'
            and a.ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'
            ) as tdts where aftlottype!='重工帳' and IsCancel is null group by ProdClass,PartNum,Version,LotNum,Lottype,Layer,aftlottype,IsCancel
            `)
                ,
            sql.query(`SELECT DISTINCT BinCode FROM YM_ULT_UnitBase(nolock) 
        WHERE ScrappedSource IN ('FVI58;FVI59','FVI58;FVI60') 
        AND BinCode IS NOT NULL 
        AND BinCode <>'' 
        AND LEFT(BinCode,1) NOT IN ('0','2','T')`)]);
        })
        .then(([result, defect]) => {

            const promiseAry = [];

            if (result.recordset.length === 0) {
                throw new Error('沒有資料產出');
            };

            bincodeAry = defect.recordset.map((i) => i.BinCode);
            lotStr = "'" + result.recordset.map((i) => i.LotNum).join("','") + "'";

            const pivotStr = '[' + bincodeAry.join('],[') + ']';
            const bincodeStr = bincodeAry.map((code) => `CASE WHEN [${code}] IS NULL THEN '0' ELSE [${code}] END ${code.replace('-', '_')}`).join(',')

            result.recordset.forEach((i) => {

                // sql.input('inputField1', sql.VarChar, myFirstInput);
                // sql.input('inputField2', sql.VarChar, mySecondInput);

                promiseAry.push(sql.query(`WITH dt AS(SELECT LotNum,VrsCode,UnitCode,Cast(LEFT(UnitCode,2)AS REAL)Unit_X,Cast(RIGHT(UnitCode,2)AS REAL)Unit_Y,BinCode,ScrappedSource 
                FROM YM_ULT_UnitBase(nolock) WHERE  LotNum ='${i.LotNum}')
                
            SELECT PartNo='${i.PartNum}',m.LotNum,ChangeTime='${timestampToYMDHIS(i.ChangeTime)}',m.VrsCode,UnitCode,Unit_X,Unit_Y,Count,${bincodeStr} FROM 
                (SELECT LotNum,VrsCode,UnitCode,Unit_X,Unit_Y,Count(*)Count FROM dt GROUP BY LotNum,VrsCode,UnitCode,Unit_X,Unit_Y)m
            LEFT JOIN
            (SELECT * FROM 
            (SELECT LotNum,VrsCode,BinCode,Count(*)Count FROM dt  WHERE ScrappedSource IN ('FVI58;FVI59','FVI58;FVI60')
            GROUP BY LotNum,VrsCode,BinCode)p
                PIVOT 
            ( Sum(Count) For BinCode In (${pivotStr})
            )T)t
            ON m.LotNum=t.LotNum AND m.VrsCode=t.VrsCode`))
            });
            return Promise.all(promiseAry);
        })
        .then((result) => {
            // [{recordsets:[],recordset:[{},{},{},...]}  ,{},{}]
            sql.close();

            result.forEach((i) => {
                dataAry = [...dataAry, ...i.recordset]
            });

            // console.log('dataAry.length',dataAry.length);

            return sql.connect(configAcme);
        })
        .then(() => {

            const processStr = "'" + processAry.join("','") + "'";
            const processPivot = "[" + processAry.join("],[") + "]";
            const processColumn = processAry.map((i) => `[${i}] Machine_${i}`).join(',');

            return sql.query(`SELECT lotnum,${processColumn} FROM (
            SELECT * FROM(
                SELECT lotnum,MachineName,SUBSTRING(c.ProcName,1,3)+CAST(h.BefDegree AS NVARCHAR)+SUBSTRING(c.ProcName,4,3)+CAST(BefTimes AS NVARCHAR) ProcName 
                FROM PDL_CKHistory(nolock)h 
                    INNER JOIN
                ProcBasic(nolock)c ON h.proccode=c.ProcCode
                    INNER JOIN
                PDL_Machine(nolock)m ON h.Machine=m.MachineId 
            WHERE lotnum IN (${lotStr}) AND h.AftStatus='CheckOut' AND
            SUBSTRING(c.ProcName,1,3)+CAST(h.BefDegree AS NVARCHAR)+SUBSTRING(c.ProcName,4,3)+CAST(BefTimes AS NVARCHAR)
            IN (${processStr})
                ) p PIVOT
            (Max(MachineName) FOR ProcName IN (${processPivot}) 
            )T)t`);
        })
        .then((result) => {
            
            result.recordset.forEach((i) => {
                ///i {lotnum,Machine_...,Machine_...}
                const matchItem = dataAry.filter((d) => d.LotNum === i.lotnum);
                //{},{},{}
                processAry.forEach((p) => {////PTHCUM...

                    matchItem.forEach((m) => {
                        m[`Machine_${p}`] = i[`Machine_${p}`] === undefined ? '' : i[`Machine_${p}`];
                    })
                })

            });

            dataAry.forEach((d) => {

                const matchObj = result.recordset.find((i) => d.LotNum === i.lotnum);

                processAry.forEach((p) => {

                    if (matchObj === undefined) {
                        d[`Machine_${p}`] = '';
                    } else {
                        d[`Machine_${p}`] = matchObj[`Machine_${p}`] === undefined ? '' : matchObj[`Machine_${p}`];
                    }

                })
            })
            res.json({ vistack: { data: dataAry, db: 'vi', table: 'vi_stack', match: [
                "PartNo", "UnitCode", "Count",
                "A0", "A0_E", "A1", "A10", "A11", "A1_2", "A14", "A1_P", "A1_T", "A1_W", "A2", "A3", "A3_1", "A4", "A4_1", "A5", "A5_1", "A6", "A6_B", "A6_G", "A6_W", "A8",
                "B0", "B1", "B16", "B3", "B4", "B5", "B6",
                "D0", "D1", "D14", "D16", "D2", "D3", "D4", "D5", "D6", "D8",
                "E0", "E1", "E14", "E2", "E3", "E5", "E6", "E8",
                "F0", "F1", "F2", "F11", "F6", "F99",
                "G1", "G17", "G4", "G4_N", "G5", "G6",
                "H0", "H1", "H14", "H2", "H3", "H4", "H5", "H6", "H8",
                "J0", "J1", "J12", "J13", "J14", "J16", "J3", "J5", "J6",
                "Machine_SMK1VDF1", "Machine_SMK1SEP1", "Machine_MDL1MDC1", "Machine_PSP1PTM1", "Machine_PSP1UBL1", "Machine_TST1MPW1", "Machine_PSP2CCM1", "Machine_PSP2DSS1", "Machine_AOI1AEI1", "Machine_AOI1VRS1", "Machine_AOI1AOS1"
              ] } });//送資料出去
            // return mysqlConnection(configFunc('vi'))
        })
        // .then((connection) => {
        //     const column=Object.keys(dataAry[0]).map((k)=>`${k} VARCHAR(100) NOT NULL`).join(',');
        //     return queryFunc(connection,`create table vi_stack(${column})`)
        // })
        .catch((err) => {
            console.log(err);
            res.json({ 'status': false, 'message': '取得資料失敗' });
        })
        .finally(() => {
            sql.close();
        })

});
router.get('/ipqc', async (req, res) => {
    try {
        const curDate = new Date();
        curDate.setHours(8, 0, 0, 0);
        const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

        curDate.setDate(curDate.getDate() - 4);
        curDate.setHours(8, 0, 0, 0);
        const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

        let viData = [];
        let videfectData = [];
        let filterLot = [];
        let IPQCandCVI = [];
        let vrs1Part = [];
        let defectAry = [];

        // 連接到 ACME 數據庫
        await sql.connect(configAcme);
        const sqlviReadout = `select  convert(varchar, max(ChangeTime), 111)+' '+convert(varchar, max(ChangeTime), 114) ChangeTime, ProdClass, PartNum,RTRIM(LotNum)LotNum, Lottype from
             (select a.ChangeTime, f.ProdClass, left(a.partnum, 7) PartNum, Concat(right(a.partnum, 1), a.revision) as Version, a.lotnum as LotNum, d.ITypeName as [Lottype], c.LayerName as Layer,
                 b.ProcName, e.MachineName, (c.EndLayer - c.FromLayer + 1) / 2 as [Layer name], aftlottype, a.IsCancel
     from acme.dbo.pdl_ckhistory a(nolock)
     inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
     inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
     inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
     inner join acme.dbo.PDL_Machine e(nolock) on a.machine = e.machineid
     inner join acme.dbo.prodbasic f(nolock) on a.partnum = f.PartNum and a.revision = f.Revision
     where a.AftStatus = 'CheckOut'
     and left(d.ITypeName, 2) not in ('E3')
     and a.proccode = 'FVI42'
     and a.ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'
             ) as tdt where aftlottype != '重工帳' and IsCancel is null  group by ProdClass, PartNum,LotNum, Lottype
     Union
     select convert(varchar, max(ChangeTime), 111)+' '+convert(varchar, max(ChangeTime), 114) ChangeTime, ProdClass, PartNum, RTRIM(LotNum)LotNum, Lottype from
             (select a.ChangeTime, f.ProdClass, left(a.partnum, 7) PartNum, Concat(right(a.partnum, 1), a.revision) as Version, a.lotnum as LotNum, d.ITypeName as [Lottype], c.LayerName as Layer,
                 b.ProcName, e.MachineName, (c.EndLayer - c.FromLayer + 1) / 2 as [Layer name], aftlottype, a.IsCancel
     from acme.dbo.pdl_ckhistory a(nolock)
     inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
     inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
     inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
     inner join acme.dbo.PDL_Machine e(nolock) on a.machine = e.machineid
     inner join acme.dbo.prodbasic f(nolock) on a.partnum = f.PartNum and a.revision = f.Revision
     where a.AftStatus = 'CheckOut'
     and left(d.ITypeName, 2) not in ('E3')
     AND a.partnum + a.revision IN (SELECT DISTINCT PartNum FROM CAC_PartProcLayerNum(nolock)t WHERE ProcCode='FVI08' AND NOT EXISTS (SELECT 1 FROM  CAC_PartProcLayerNum(nolock)h WHERE t.PartNum=h.PartNum AND h.ProcCode='FVI42' )) 
     AND a.BefTimes = '1'
     AND a.proccode = 'FVI08'
     AND a.ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'
             ) as tdts where aftlottype != '重工帳' and IsCancel is null group by ProdClass, PartNum, LotNum, Lottype
         `;
        const result = await sql.query(sqlviReadout);
        viData = result.recordset;
        filterLot = "'" + result.recordset.map((i) => i.LotNum).join("','") + "'";

        const sqlIPQC_M = `select a.lotnum as LotNum,a.Qnty IPQC_M
            from acme.dbo.pdl_ckhistory a(nolock)
            inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
            inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
            inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
            inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
            where a.BefStatus='MoveIn'
            and a.IsCancel is null
            and a.AftStatus='CheckIn'
            and substring(b.ProcName,1,3)+Cast(BefDegree as nvarchar)+substring(b.ProcName,4,3)+Cast(BefTimes as nvarchar) = 'FVI1FVI1'
            and a.lotnum in (${filterLot})
            order by ChangeTime desc`;
        const sqlvrs1Part = `SELECT DISTINCT PartNum FROM CAC_PartProcLayerNum(nolock)t
            WHERE ProcCode='FVI59'`;

        const [resultIPQC_M, resultvrs1Part] = await Promise.all([
            sql.query(sqlIPQC_M),
            sql.query(sqlvrs1Part)
        ]);

        sql.close();

        viData.forEach((v) => {
            let idx = resultIPQC_M.recordset.findIndex((r) => r.LotNum === v.LotNum);
            v.IPQC_M = idx !== -1 ? resultIPQC_M.recordset[idx].IPQC_M : 0;
        });

        vrs1Part = "'" + resultvrs1Part.recordset.map((i) => i.PartNum).join("','") + "'";

        // 連接到 DC 數據庫
        await sql.connect(configDc);
        const sqlIPQC_T = `SELECT Lot,Sum(Cast(QUNTY as real))IPQC_T_Count
            FROM V_YM_IPQC_VI_forYIPDashBoard(nolock) 
            WHERE Lot in (${filterLot}) 
            AND Defect_Code LIKE 'T%'
            AND QUNTY<>'0' GROUP BY Lot`;
        const sqlIPQC_CVI = `SELECT STEPTYPE='IPQC',Lot LOTNO,Defect_Code DFCOD,Cast(QUNTY as real)QUNTY 
            FROM V_YM_IPQC_VI_forYIPDashBoard(nolock) 
            WHERE Lot IN (${filterLot}) AND Defect_Code  NOT LIKE 'T%'
            UNION
            SELECT STEPTYPE='CVI',L.LOTNO,T.DFCOD,T.QUNTY FROM 
            (SELECT a.RK01,a.QUNTY,c.DFCOD FROM YS_Multiple_Def_03(nolock) a 
            INNER JOIN YS_DEFECT_CODE_04(nolock) c 
            ON a.RK04=c.RKEY 
            WHERE RK01 IN 
                (SELECT RKEY FROM YS_Multiple_DATA_01 WHERE LOTNO IN (${filterLot}) AND STEPTYPE='CVI')
            )T INNER JOIN  YS_Multiple_DATA_01(nolock)L ON T.RK01=L.RKEY `;

        const [resultIPQC_T, resultIPQC_CVI] = await Promise.all([
            sql.query(sqlIPQC_T),
            sql.query(sqlIPQC_CVI)
        ]);

        sql.close();

        viData.forEach((v) => {
            let idx = resultIPQC_T.recordset.findIndex((r) => r.Lot === v.LotNum);
            v.IPQC_T_Count = idx !== -1 ? resultIPQC_T.recordset[idx].IPQC_T_Count : 0;
        });

        IPQCandCVI = resultIPQC_CVI.recordset;

        // 連接到 Metrology 數據庫
        await sql.connect(configMetrology);
        const sqlVRS1_M = `SELECT LotNum,Count(*)VRS1_M FROM 
            (SELECT LotNum,Unit2DID,ROW_NUMBER() OVER (PARTITION BY Unit2DID ORDER BY Side desc) Rank 
            FROM YM_AVI_Dashboard_RawData 
            WHERE ProcCode in ('FVI59','FVI06') 
            AND LotNum IN (${filterLot})
            AND PartNum IN (${vrs1Part})
            AND VRS_Scrapped='1' 
            AND VRS_Judge not like 'T%')T 
            WHERE Rank='1' GROUP BY LotNum`;
        const sqlVRS1_S = `SELECT STEPTYPE='VRS1',LOTNO,DFCOD,QUNTY FROM
            (SELECT LotNum LOTNO,left(PartNum,7)PN,Unit2DID,VRS_JUDGE DFCOD,VRS_SCRAPPED QUNTY,VRS_End_Time,ROW_NUMBER() OVER (PARTITION BY Unit2DID Order BY Side desc) Rank 
            FROM YM_AVI_Dashboard_RawData 
            WHERE ProcCode in ('FVI59','FVI06') 
            AND LotNum IN (${filterLot}) 
            AND PartNum IN (${vrs1Part}) 
            AND VRS_Scrapped<>'0' 
            AND VRS_Judge not like 'T%' 
            AND VRS_Scrapped is not null)T where Rank='1'`;

        const [resultVRS1_M, resultVRS1_S] = await Promise.all([
            sql.query(sqlVRS1_M),
            sql.query(sqlVRS1_S)
        ]);

        sql.close();

        const totalS = [...IPQCandCVI, ...resultVRS1_S.recordset];
        defectAry = [...new Set(totalS.map((i) => i.DFCOD))];

        viData.forEach((v) => {
            const idx = resultVRS1_M.recordset.findIndex((r) => r.LotNum === v.LotNum);
            if (idx !== -1) {
                v.VRS1_M = resultVRS1_M.recordset[idx].VRS1_M;
            } else {
                v.VRS1_M = 0;
            }

            const lotData = totalS.filter((t) => t.LOTNO === v.LotNum);

            if (lotData.length > 0) {
                const ipqcCount = lotData.filter((i) => i.STEPTYPE === 'IPQC').map((i) => i.QUNTY).reduce((a, b) => a + b, 0);
                const cviCount = lotData.filter((i) => i.STEPTYPE === 'CVI').map((i) => i.QUNTY).reduce((a, b) => a + b, 0);
                const vrs1Count = lotData.filter((i) => i.STEPTYPE === 'VRS1').map((i) => i.QUNTY).reduce((a, b) => a + b, 0);
                const totalQUNTY = ipqcCount + cviCount + vrs1Count;

                v.IPQC_S = ipqcCount;
                v.CVI_S = cviCount;
                v.VRS1_S = vrs1Count;
                v.Yield = Number((1 - (totalQUNTY / (v.IPQC_M - v.IPQC_T_Count + v.VRS1_M))).toFixed(4));

                defectAry.forEach((d) => {
                    const videfectObj = {
                        PartNum: v.PartNum,
                        LotNum: v.LotNum,
                        Defect: d
                    };

                    const defectData = lotData.filter((l) => l.DFCOD === d);

                    if (defectData.length > 0) {
                        const sumQUNTY = defectData.map((d) => d.QUNTY).reduce((a, b) => a + b, 0);
                        videfectObj.Rate = Number((sumQUNTY / (v.IPQC_M - v.IPQC_T_Count + v.VRS1_M)).toFixed(4));
                    } else {
                        videfectObj.Rate = 0;
                    }

                    videfectData.push(videfectObj);
                });
            } else {
                v.IPQC_S = 0;
                v.CVI_S = 0;
                v.VRS1_S = 0;
                v.Yield = 0;
            }
        });
        const resultipqc=await poolDc.query(`select
t1.*,
t2.DefectID
from(
SELECT  
    [料號] as PartNum,
    [批號] as LotNum,
    [途程] as Process,
    [缺點代碼] as CtrlName,
    [抽樣板號] as SampleID,
    SUM(CAST(REPLACE([defect rate], '%', '') AS float)) as Rate 
FROM V_YM_IPQC_SIP_forYIPDashBoard 
WHERE [批號] in (${filterLot}) 
GROUP BY [料號], [批號], [途程], [缺點代碼],[抽樣板號]) t1
left join(
	select 
	[批號],[途程],
	[缺點代碼],
	itemNo as DefectID
	from V_YM_IPQC_SIP_forYIPDashBoard
	WHERE [批號] in (${filterLot})
	and itemNo <>''
) t2
on t1.LotNum=t2.[批號] 
and t1.Process=t2.[途程]
and t1.CtrlName=t2.[缺點代碼]`)
        // 連接到 SPC 數據庫
        await sql.connect(configSPC);
        const resultSPC = await sql.query(`
            SELECT Process,PartNum,LotNum,CtrlName,Round((SUM(CAST (MeasData as real))/2)/100,4) Rate FROM (SELECT Process,LEFT(PartNum,7)PartNum,LotNum,CtrlName,MeasData,ROW_NUMBER() OVER (PARTITION BY Process,LotNum,CtrlName ORDER BY MeasData DESC)rn FROM
(SELECT  
CASE WHEN SUBSTRING(c.FileName,1,CHARINDEX('_',c.FileName)-1)='TST' THEN 'TST' 
ELSE 
SUBSTRING(c.FileName,CHARINDEX('#',c.FileName)+1,LEN(c.FileName)-CHARINDEX('#',c.FileName)-2) END
Process,
case d.ctrlname
when 'A0-I' then 'A0'
    when 'A0-P' then 'A0'
    when 'A0-S' then 'A0'
else d.ctrlname end as CtrlName,
e.L51 PartNum,
left(e.L52,14) LotNum,
f.MeasData,SN
FROM var_filegroup b,Var_File c,var_ctrl d,Var_DataGroup e,Var_Data f
WHERE 
b.filegroupid = c.filegroupid
and c.fileid = d.fileid
and e.CtrlID = d.ctrlid
and f.DataGroupID = e.DataGroupID                
--and d.ctrlname in ('A0', 'A0-E', 'A1', 'A1-T', 'A1-W', 'A3', 'A5', 'A5-3', 'A6', 'A6-W', 'D0', 'D5-1', 'D6', 'D6-D', 'D6-R', 'D8', 'D14', 'J0', 'J16', 'A0-I', 'A0-P', 'A0-S')           
--and b.FileGroupName in ('CY01EPG_表面處理(EPG)', 'CY01PSP_切割(PSP)', 'CY01PSP_表面加工(PSP)', 'CY01SMK_防焊(SMK)', 'CY01TST_電測(TST)')
and left(e.L52,14) IN (${filterLot})
and c.FileName like '%IPQC YIELD%' and c.FileName <>'SMK_IPQC YIELD#SMK AOI_Y')T
)S WHERE rn<=2 GROUP BY Process,PartNum,LotNum,CtrlName
            `);
        sql.close();

        res.json({
            viyield: { data: viData, db: 'vi', table: 'vi_yield', match: ['Yield', 'IPQC_M', 'IPQC_T_Count', 'VRS1_M', 'IPQC_S', 'CVI_S', 'VRS1_S'] },
            videfect: { data: videfectData, db: 'vi', table: 'vi_defect', match: ['Rate'] },
            vispc: { data: resultSPC.recordset, db: 'vi', table: 'vi_spc', match: ['Rate'] },
            viipqc: { data: resultipqc.recordset, db: 'vi', table: 'vi_ipqc', match: ['Rate'] }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '處理請求時發生錯誤' });
    } finally {
        await sql.close();
    }
});


// router.get('/ipqc', (req, res) => {

//     const curDate = new Date()
//     curDate.setHours(8, 0, 0, 0);
//     const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

//     curDate.setDate(curDate.getDate() - 2);
//     curDate.setHours(8, 0, 0, 0);
//     const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

//     let viData = [];
//     let videfectData = [];
//     let filterLot = [];
//     let IPQCandCVI = [];

//     let vrs1Part = [];
//     let defectAry = [];

//     sql.connect(configAcme)
//         .then(() => {
//             const sqlviReadout = `select  convert(varchar, max(ChangeTime), 111)+' '+convert(varchar, max(ChangeTime), 114) ChangeTime, ProdClass, PartNum,RTRIM(LotNum)LotNum, Lottype from
//             (select a.ChangeTime, f.ProdClass, left(a.partnum, 7) PartNum, Concat(right(a.partnum, 1), a.revision) as Version, a.lotnum as LotNum, d.ITypeName as [Lottype], c.LayerName as Layer,
//                 b.ProcName, e.MachineName, (c.EndLayer - c.FromLayer + 1) / 2 as [Layer name], aftlottype, a.IsCancel
//     from acme.dbo.pdl_ckhistory a(nolock)
//     inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
//     inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
//     inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
//     inner join acme.dbo.PDL_Machine e(nolock) on a.machine = e.machineid
//     inner join acme.dbo.prodbasic f(nolock) on a.partnum = f.PartNum and a.revision = f.Revision
//     where a.AftStatus = 'CheckOut'
//     and left(d.ITypeName, 2) not in ('E3')
//     and a.proccode = 'FVI42'
//     and a.ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'
//             ) as tdt where aftlottype != '重工帳' and IsCancel is null  group by ProdClass, PartNum,LotNum, Lottype
//     Union
//     select convert(varchar, max(ChangeTime), 111)+' '+convert(varchar, max(ChangeTime), 114) ChangeTime, ProdClass, PartNum, RTRIM(LotNum)LotNum, Lottype from
//             (select a.ChangeTime, f.ProdClass, left(a.partnum, 7) PartNum, Concat(right(a.partnum, 1), a.revision) as Version, a.lotnum as LotNum, d.ITypeName as [Lottype], c.LayerName as Layer,
//                 b.ProcName, e.MachineName, (c.EndLayer - c.FromLayer + 1) / 2 as [Layer name], aftlottype, a.IsCancel
//     from acme.dbo.pdl_ckhistory a(nolock)
//     inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
//     inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
//     inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
//     inner join acme.dbo.PDL_Machine e(nolock) on a.machine = e.machineid
//     inner join acme.dbo.prodbasic f(nolock) on a.partnum = f.PartNum and a.revision = f.Revision
//     where a.AftStatus = 'CheckOut'
//     and left(d.ITypeName, 2) not in ('E3')
//     AND a.partnum + a.revision IN (SELECT DISTINCT PartNum FROM CAC_PartProcLayerNum(nolock)t WHERE ProcCode='FVI08' AND NOT EXISTS (SELECT 1 FROM  CAC_PartProcLayerNum(nolock)h WHERE t.PartNum=h.PartNum AND h.ProcCode='FVI42' )) 
//     AND a.BefTimes = '1'
//     AND a.proccode = 'FVI08'
//     AND a.ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'
//             ) as tdts where aftlottype != '重工帳' and IsCancel is null group by ProdClass, PartNum, LotNum, Lottype
//         `;
//             ///FVI42->CVI
//             ///FVI08->IPQC

//             return sql.query(sqlviReadout);
//         })
//         .then((result) => {
//             viData = result.recordset;
//             // res.json(viData)
//             // aaa
//             filterLot = "'" + result.recordset.map((i) => i.LotNum).join("','") + "'";

//             const sqlIPQC_M = `select a.lotnum as LotNum,a.Qnty IPQC_M
//             from acme.dbo.pdl_ckhistory a(nolock)
//             inner join acme.dbo.numoflayer c(nolock) on a.layer = c.Layer
//             inner join acme.dbo.ClassIssType d(nolock) on a.isstype = d.ITypeCode
//             inner join acme.dbo.procbasic b(nolock) on a.proccode = b.ProcCode
//             inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
//             where a.BefStatus='MoveIn'
//             and a.IsCancel is null
//             and a.AftStatus='CheckIn'
//             and substring(b.ProcName,1,3)+Cast(BefDegree as nvarchar)+substring(b.ProcName,4,3)+Cast(BefTimes as nvarchar) = 'FVI1FVI1'
//             and a.lotnum in (${filterLot})
//             order by ChangeTime desc`;

//             const sqlvrs1Part = `SELECT DISTINCT PartNum FROM CAC_PartProcLayerNum(nolock)t
//             WHERE ProcCode='FVI59'`;

//             return Promise.all(
//                 [
//                     sql.query(sqlIPQC_M),
//                     sql.query(sqlvrs1Part)
//                 ]
//             );
//         })
//         .then(([resultIPQC_M, resultvrs1Part]) => {
//             sql.close();

//             viData.forEach((v) => {
//                 let idx = resultIPQC_M.recordset.findIndex((r) => r.LotNum === v.LotNum);
//                 if (idx !== -1) {
//                     v.IPQC_M = resultIPQC_M.recordset[idx].IPQC_M;
//                 } else {
//                     v.IPQC_M = 0; ///不應該有0
//                 }
//             });
//             // IPQC_M done!

//             vrs1Part = "'" + resultvrs1Part.recordset.map((i) => i.PartNum).join("','") + "'";///有VRS1的料號

//             return sql.connect(configDc)
//         })
//         .then(() => {
//             //T類缺點
//             const sqlIPQC_T = `SELECT Lot,Sum(Cast(QUNTY as real))IPQC_T_Count
//             FROM V_YM_IPQC_VI_forYIPDashBoard(nolock) 
//             WHERE Lot in (${filterLot}) 
//             AND Defect_Code LIKE 'T%'
//             AND QUNTY<>'0' GROUP BY Lot`;

//             const sqlIPQC_CVI = `SELECT STEPTYPE='IPQC',Lot LOTNO,Defect_Code DFCOD,Cast(QUNTY as real)QUNTY 
//             FROM V_YM_IPQC_VI_forYIPDashBoard(nolock) 
//             WHERE Lot IN (${filterLot}) AND Defect_Code  NOT LIKE 'T%'
//             UNION
//             SELECT STEPTYPE='CVI',L.LOTNO,T.DFCOD,T.QUNTY FROM 
//             (SELECT a.RK01,a.QUNTY,c.DFCOD FROM YS_Multiple_Def_03(nolock) a 
//             INNER JOIN YS_DEFECT_CODE_04(nolock) c 
//             ON a.RK04=c.RKEY 
//             WHERE RK01 IN 
//                 (SELECT RKEY FROM YS_Multiple_DATA_01 WHERE LOTNO IN (${filterLot}) AND STEPTYPE='CVI')
//             )T INNER JOIN  YS_Multiple_DATA_01(nolock)L ON T.RK01=L.RKEY `

//             return Promise.all(
//                 [
//                     sql.query(sqlIPQC_T),
//                     sql.query(sqlIPQC_CVI)
//                 ]
//             );
//         })
//         .then(([resultIPQC_T, resultIPQC_CVI]) => {
//             sql.close();

//             viData.forEach((v) => {
//                 let idx = resultIPQC_T.recordset.findIndex((r) => r.Lot === v.LotNum);
//                 if (idx !== -1) {
//                     v.IPQC_T_Count = resultIPQC_T.recordset[idx].IPQC_T_Count;
//                 } else {
//                     v.IPQC_T_Count = 0;
//                 }
//             });
//             // IPQC_T done!

//             IPQCandCVI = resultIPQC_CVI.recordset;
//             //resultIPQC_CVI 要跟VRS1 合併

//             // STEPTYPE LOTNO   DFCOD   QUNTY
//             // IPQC  238OE001-03-00 B0  1

//             ///這裡要處理viData 分母-IPQC_T & 分子IPQC+CVI

//             return sql.connect(configMetrology)
//         })
//         .then(() => {

//             // 要排除沒有VRS1圖層的批

//             const sqlVRS1_M = `SELECT LotNum,Count(*)VRS1_M FROM 
//             (SELECT LotNum,Unit2DID,ROW_NUMBER() OVER (PARTITION BY Unit2DID ORDER BY Side desc) Rank 
//             FROM YM_AVI_Dashboard_RawData 
//             WHERE ProcCode in ('FVI59','FVI06') 
//             AND LotNum IN (${filterLot})
//             AND PartNum IN (${vrs1Part})
//             AND VRS_Scrapped='1' 
//             AND VRS_Judge not like 'T%')T 
//             WHERE Rank='1' GROUP BY LotNum`;

//             const sqlVRS1_S = `SELECT STEPTYPE='VRS1',LOTNO,DFCOD,QUNTY FROM
//             (SELECT LotNum LOTNO,left(PartNum,7)PN,Unit2DID,VRS_JUDGE DFCOD,VRS_SCRAPPED QUNTY,VRS_End_Time,ROW_NUMBER() OVER (PARTITION BY Unit2DID Order BY Side desc) Rank 
//             FROM YM_AVI_Dashboard_RawData 
//             WHERE ProcCode in ('FVI59','FVI06') 
//             AND LotNum IN (${filterLot}) 
//             AND PartNum IN (${vrs1Part}) 
//             AND VRS_Scrapped<>'0' 
//             AND VRS_Judge not like 'T%' 
//             AND VRS_Scrapped is not null)T where Rank='1'`;

//             return Promise.all(
//                 [
//                     sql.query(sqlVRS1_M),
//                     sql.query(sqlVRS1_S)
//                 ]
//             );
//         })
//         .then(([resultVRS1_M, resultVRS1_S]) => {
//             // 這裡要處理分母分子各加上VRS1
//             sql.close();
//             const totalS = [...IPQCandCVI, ...resultVRS1_S.recordset];
//             defectAry = [...new Set(totalS.map((i) => i.DFCOD))];

//             viData.forEach((v) => {
//                 const idx = resultVRS1_M.recordset.findIndex((r) => r.LotNum === v.LotNum);
//                 if (idx !== -1) {
//                     v.VRS1_M = resultVRS1_M.recordset[idx].VRS1_M;
//                 } else {
//                     v.VRS1_M = 0;
//                 }

//                 const lotData = totalS.filter((t) => t.LOTNO === v.LotNum);

//                 if (lotData.length > 0) {
//                     const ipqcCount = lotData.filter((i) => i.STEPTYPE === 'IPQC').map((i) => i.QUNTY).reduce((a, b) => a + b, 0);
//                     const cviCount = lotData.filter((i) => i.STEPTYPE === 'CVI').map((i) => i.QUNTY).reduce((a, b) => a + b, 0);
//                     const vrs1Count = lotData.filter((i) => i.STEPTYPE === 'VRS1').map((i) => i.QUNTY).reduce((a, b) => a + b, 0);
//                     const totalQUNTY = ipqcCount + cviCount + vrs1Count;

//                     v.IPQC_S = ipqcCount;
//                     v.CVI_S = cviCount;
//                     v.VRS1_S = vrs1Count;
//                     v.Yield = Number((1 - (totalQUNTY / (v.IPQC_M - v.IPQC_T_Count + v.VRS1_M))).toFixed(4));

//                     defectAry.forEach((d) => {
//                         videfectObj = {};

//                         videfectObj.PartNum = v.PartNum;
//                         videfectObj.LotNum = v.LotNum;
//                         videfectObj.Defect = d;

//                         const defectData = lotData.filter((l) => l.DFCOD === d);

//                         if (defectData.length > 0) {
//                             const sumQUNTY = defectData.map((d) => d.QUNTY).reduce((a, b) => a + b, 0);
//                             videfectObj.Rate = Number((sumQUNTY / (v.IPQC_M - v.IPQC_T_Count + v.VRS1_M)).toFixed(4));

//                         } else {
//                             videfectObj.Rate = 0
//                         }

//                         videfectData.push(videfectObj);
//                     });

//                 } else {
//                     v.IPQC_S = 0;
//                     v.CVI_S = 0;
//                     v.VRS1_S = 0;
//                     v.Yield = 0;
//                 }
//             });
//             // 至此分母 done!   IPQC_M+VRS1_M-IPQC_T

//             return sql.connect(configSPC)
//         })
//         .then(() => {
//             return sql.query(`
//             SELECT Process,PartNum,LotNum,CtrlName,Round((SUM(CAST (MeasData as real))/2)/100,4) Rate FROM (SELECT Process,LEFT(PartNum,7)PartNum,LotNum,CtrlName,MeasData,ROW_NUMBER() OVER (PARTITION BY Process,LotNum,CtrlName ORDER BY MeasData DESC)rn FROM
// (SELECT  
// CASE WHEN SUBSTRING(c.FileName,1,CHARINDEX('_',c.FileName)-1)='TST' THEN 'TST' 
// ELSE 
// SUBSTRING(c.FileName,CHARINDEX('#',c.FileName)+1,LEN(c.FileName)-CHARINDEX('#',c.FileName)-2) END
// Process,
// case d.ctrlname
// when 'A0-I' then 'A0'
//     when 'A0-P' then 'A0'
//     when 'A0-S' then 'A0'
// else d.ctrlname end as CtrlName,
// e.L51 PartNum,
// left(e.L52,14) LotNum,
// f.MeasData,SN
// FROM var_filegroup b,Var_File c,var_ctrl d,Var_DataGroup e,Var_Data f
// WHERE 
// b.filegroupid = c.filegroupid
// and c.fileid = d.fileid
// and e.CtrlID = d.ctrlid
// and f.DataGroupID = e.DataGroupID                
// --and d.ctrlname in ('A0', 'A0-E', 'A1', 'A1-T', 'A1-W', 'A3', 'A5', 'A5-3', 'A6', 'A6-W', 'D0', 'D5-1', 'D6', 'D6-D', 'D6-R', 'D8', 'D14', 'J0', 'J16', 'A0-I', 'A0-P', 'A0-S')           
// --and b.FileGroupName in ('CY01EPG_表面處理(EPG)', 'CY01PSP_切割(PSP)', 'CY01PSP_表面加工(PSP)', 'CY01SMK_防焊(SMK)', 'CY01TST_電測(TST)')
// and left(e.L52,14) IN (${filterLot})
// and c.FileName like '%IPQC YIELD%' and c.FileName <>'SMK_IPQC YIELD#SMK AOI_Y')T
// )S WHERE rn<=2 GROUP BY Process,PartNum,LotNum,CtrlName
//             `);
//         })
//         .then((resultSPC) => {
//             sql.close();
//             res.json(
//                 {
//                     viyield: { data: viData, db: 'vi', table: 'vi_yield', match: ['Yield', 'IPQC_M', 'IPQC_T_Count', 'VRS1_M', 'IPQC_S', 'CVI_S', 'VRS1_S'] },
//                     videfect: { data: videfectData, db: 'vi', table: 'vi_defect', match: ['Rate'] },
//                     vispc: { data: resultSPC.recordset, db: 'vi', table: 'vi_spc', match: ['Rate'] }
//                 }
//             );
//         })
//         .catch((err) => {
//             console.log(err);
//         })
//         .finally(() => {
//             sql.close();
//         })
// })

router.get('/vrs2daily', (req, res) => {
    const curDate = new Date()
    curDate.setDate(curDate.getDate());
    curDate.setHours(8, 0, 0, 0);
    const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    curDate.setDate(curDate.getDate() - 20);
    curDate.setHours(8, 0, 0, 0);
    const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    let readoutData = [];
    let readoutLotStr = '';
    let connection;

    const vrs2Sql = `SELECT LEFT(partnum,7)PartNum,lotnum LotNum,convert(varchar, ChangeTime, 120) ChangeTime,SQnty_S FROM PDL_CKHistory h 
    LEFT JOIN ProcBasic c 
    ON h.proccode=c.ProcCode 
    WHERE c.ProcCode='FVI58' 
    AND AftStatus='CheckOut' 
    AND IsCancel IS NULL 
    AND BefTimes='2' AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'`;

    poolAcme.query(vrs2Sql)
        .then((result) => {

            readoutData = result.recordset;

            // 取得產出批號
            readoutLotStr = `'${readoutData.map((i) => i.LotNum).join("','")}'`;

            const ipqcMSql = `SELECT h.lotnum LotNum,h.Qnty IPQC_M
            FROM PDL_CKhistory h(nolock)
            INNER JOIN ProcBasic b(nolock) ON h.proccode = b.ProcCode
            WHERE h.BefStatus='MoveIn'
            AND h.IsCancel IS NULL
            AND h.AftStatus='CheckIn'
            AND lotnum IN (${readoutLotStr})
            AND SUBSTRING(b.ProcName,1,3)+CAST(BefDegree AS NVARCHAR)+SUBSTRING(b.ProcName,4,3)+CAST(BefTimes AS NVARCHAR) = 'FVI1FVI1'`;

            const vrs1MSql = `SELECT LotNum,Count(*)VRS1_M FROM 
            (SELECT LotNum,Unit2DID,ROW_NUMBER() OVER (PARTITION BY Unit2DID ORDER BY Side desc) Rank FROM YM_AVI_Dashboard_RawData 
            WHERE ProcCode= in ('FVI59','FVI06') 
            AND LotNum IN (${readoutLotStr}) 
            AND VRS_Scrapped='1' 
            AND VRS_Judge NOT LIKE 'T%') T WHERE Rank='1' GROUP BY LotNum`;

            const ipqcTSql = `SELECT Lot,Sum(Cast(QUNTY as real))IPQC_T_Count FROM V_YM_IPQC_VI_forYIPDashBoard 
            WHERE Lot IN (${readoutLotStr}) 
            AND Defect_Code LIKE 'T%' 
            AND QUNTY<>'0' GROUP BY Lot`;

            return Promise.all([
                poolAcme.query(ipqcMSql),
                poolMetrology.query(vrs1MSql),
                poolDc.query(ipqcTSql),
                mysqlConnection(configFunc('vi'))
            ])
        })
        .then((result) => {

            const [ipqcmData, vrs1mData, ipqctData, connect] = result;
            connection = connect;
            readoutData.forEach((r) => {
                const ipqcmIndex = ipqcmData.recordset.findIndex((m) => m.LotNum === r.LotNum);
                ipqcmIndex !== -1 ? r.ipqc_m = ipqcmData.recordset[ipqcmIndex].IPQC_M : r.ipqc_m = 0;

                const vrs1mIndex = vrs1mData.recordset.findIndex((m) => m.LotNum === r.LotNum);
                vrs1mIndex !== -1 ? r.vrs1_m = vrs1mData.recordset[vrs1mIndex].VRS1_M : r.vrs1_m = 0;

                const ipqctIndex = ipqctData.recordset.findIndex((m) => m.Lot === r.LotNum);
                ipqctIndex !== -1 ? r.ipqc_t = ipqctData.recordset[ipqctIndex].IPQC_T_Count : r.ipqc_t = 0;

                r.vrs2_deno = r.ipqc_m + r.vrs1_m - r.ipqc_t;
            });

            const ultvrsSql = `SELECT LotNum,BinCode,Count(*)Count FROM YM_ULT_UnitBase 
            WHERE ScrappedSource='FVI58;FVI60' 
            AND BinCode LIKE 'J%' 
            AND LotNum IN (${readoutLotStr})
            GROUP BY LotNum,BinCode `;

            return poolDc.query(ultvrsSql)
        })
        .then((result) => {

            const ultvrsData = result.recordset;

            const othersAry = [];
            readoutData.forEach((r) => {

                const filterData = ultvrsData.filter((u) => u.LotNum === r.LotNum);
                if (filterData.length) {
                    const othersObj = {};
                    const countSum = filterData
                        .map((i) => i.Count)
                        .reduce((a, b) => a + b, 0);

                    othersObj.LotNum = r.LotNum;
                    othersObj.BinCode = 'others';
                    othersObj.Count = r.SQnty_S - countSum < 0 ? 0 : r.SQnty_S - countSum;

                    othersAry.push(othersObj);
                } else {
                    r.Others
                }

            });

            res.json({
                vrs2readout: { data: readoutData, db: 'vi', table: 'vi_vrs2', match: ['PartNum', 'LotNum', 'ChangeTime', 'SQnty_S', 'ipqc_m', 'vrs1_m', 'ipqc_t', 'vrs2_deno'] },
                vrs2defectreadout: { data: [...othersAry, ...ultvrsData], db: 'vi', table: 'vi_vrs2_defect', match: ['LotNum', 'BinCode', 'Count'] }
            });
        })
        .catch((err) => {
            console.log(err);
        })
});
router.get('/vrs2excel', (req, res) => {

    const url = '//utcymfs01/製造部/17_終檢課/03_現場專區/Tray change/TRA前 裸視全檢報表';
    const searchfileName = '裸視全檢報表';
    const defect = ['A0', 'A0-E', 'J0', 'J5', 'A1', 'A1-T', 'A1-W', 'A5-1', 'A6-S', 'A6-B', 'A5', 'B6', 'A6', 'A7', 'A3', 'D0', 'A6-W', 'A11', 'J6'];

    const curDate = new Date()
    curDate.setDate(curDate.getDate());
    curDate.setHours(8, 0, 0, 0);
    const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    curDate.setDate(curDate.getDate() - 10);
    curDate.setHours(8, 0, 0, 0);
    const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqlStr = `SELECT * FROM  vi_vrs2 WHERE ChangeTime BETWEEN '${timestampToYMDHIS2(new Date(l8sqlTime))}' AND '${timestampToYMDHIS2(new Date(t8sqlTime))}' `;

            return queryFunc(connection, sqlStr)
        })
        .then((vrs2Data) => {

            const files = fs.readdirSync(url);
            const targetFiles = files.filter((i) => i.includes(searchfileName) && i.slice(0, 2) !== '~$');

            let vrs2peData = [];
            targetFiles.forEach((f) => {
                const workbook = XLSX.readFile(`${url}/${f}`);
                const sheetName = workbook.SheetNames[0];
                const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

                // 各缺點在該檔案的位置
                let defectlocAry = defect.map((d) => data[0].findIndex((i) => i === d));
                // 批號位置
                let lotLoc = data[0].findIndex((i) => i.includes('批號'));

                vrs2Data.forEach((i) => {

                    const matchIndex = data.filter((d) => d.length > 0).findIndex((d) => {
                        if (!d[lotLoc]) {
                            return false
                        } else {

                            return d[lotLoc].slice(0, 14) === i.LotNum
                        }
                    });

                    if (matchIndex !== -1) {

                        const matchAry = data[matchIndex];

                        defectlocAry.forEach((d) => {

                            const obj = {};
                            obj.LotNum = i.LotNum;
                            obj.BinCode = data[0][d];
                            obj.Count = matchAry[d] ? matchAry[d] : 0

                            vrs2peData.push(obj);
                        });
                    }
                })
            });

            res.json({
                vrs2pe: { data: vrs2peData, db: 'vi', table: 'vi_vrs2_pe', match: ['LotNum', 'BinCode', 'Count'] }
            });
        })
        .catch((err) => {
            console.log(err);
        });

    // res.json(data);
})

module.exports = router;
