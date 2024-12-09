const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS,timestampToYMDHIS2 } = require('../time.js');
const { poolAcme } = require('../mssql.js');

// const configDc = {
//     server: '10.22.65.120',
//     user: 'dc',
//     password: 'dc',
//     database: 'dc',
//     options: {
//         encrypt: false,
//         trustServerCertificate: true,
//         requestTimeout: 300000
//     },
//     pool: {
//         max: 10000,
//         min: 0,
//         idleTimeoutMillis: 3000000
//     }
// };

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/stack/:partnum/:defect/:process', (req, res) => {

    const { partnum, defect, process } = req.params;

    // sql.connect(configDc)
    //     .then(() => {
    //         const sqlSearch = sql.query(`SELECT DISTINCT BinCode FROM YM_ULT_UnitBase(nolock) 
    //     WHERE ScrappedSource IN ('FVI58;FVI59','FVI58;FVI60') 
    //     AND BinCode IS NOT NULL 
    //     AND BinCode <>'' 
    //     AND LEFT(BinCode,1) NOT IN ('0','2','T')`);
    //         return Promise.all([sqlSearch, mysqlConnection(configFunc('vi'))]);
    //     })
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqldata = "SELECT DISTINCT Defect FROM videfect";
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            const bincodeSum = result.map((i) => `SUM(${i.Defect.replace('-', '_')})`).join('+');

            return Promise.all([bincodeSum, mysqlConnection(configFunc('vi'))])
        })
        .then(([bincodeSum, connection]) => {

            let defectColumn = '';
            let processColumn = '';
            let processGroup = '';

            if (defect !== 'All') {
                defectColumn = `,'${defect}' Defect,Round(SUM(${defect.replace('-', '_')})/SUM(Count),4) Rate`;
            } else {
                defectColumn = `,'All' Defect,(${bincodeSum})/Sum(Count)Rate`
            }

            if (process !== 'All') {
                processColumn = `,Machine_${process} Machine`;
                processGroup = `,Machine_${process}`;
            }

            const sqldata = `SELECT PartNo,Unit_X,Unit_Y,CONCAT(Year(ChangeTime),CASE WHEN LENGTH(Week(ChangeTime)+1 )=1 THEN CONCAT('0',Week(ChangeTime)+1 ) ELSE Week(ChangeTime)+1 END )Week
            ${defectColumn}${processColumn} FROM vi_stack WHERE PartNo='${partnum}' AND LEFT(PartNo,4)<>'UMGL' 
            GROUP BY PartNo,Unit_X,Unit_Y,CONCAT(Year(ChangeTime),CASE WHEN LENGTH(Week(ChangeTime)+1)=1 THEN CONCAT('0',Week(ChangeTime)+1) ELSE Week(ChangeTime)+1 END )${processGroup}`;

            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/stackyield/:partnum/:defect', (req, res) => {
    const { partnum, defect } = req.params;

    mysqlConnection(configFunc('vi'))
        .then((connection) => {

            let defectColumn = '';

            if (defect !== 'All') {
                defectColumn = ",'"+defect+"' Defect,`"+defect.replace('_','-')+"` Rate";
            }
            const sqlStr = `SELECT PartNo,LotNum,LotType,CONCAT(Year(Datatime),CASE WHEN LENGTH(Week(Datatime)+1)=1 THEN CONCAT('0',Week(Datatime)+1) ELSE Week(Datatime)+1 END )Week,Datatime,VIYield${defectColumn} FROM
            viyield WHERE PartNo='${partnum}' AND LEFT(PartNo,4)<>'UMGL'`;
            return queryFunc(connection,sqlStr);
        })
        .then((result)=>{
            res.json(result);
        });

})

router.get('/stackdefect', (req, res) => {

    // sql.connect(configDc)
    //     .then(() => {
    //         return sql.query(`SELECT DISTINCT BinCode FROM YM_ULT_UnitBase(nolock) 
    //     WHERE ScrappedSource IN ('FVI58;FVI59','FVI58;FVI60') 
    //     AND BinCode IS NOT NULL 
    //     AND BinCode <>'' 
    //     AND LEFT(BinCode,1) NOT IN ('0','2','T')`)
    //     })

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqldefect = `SELECT DISTINCT Defect FROM videfect`;
            return queryFunc(connection, sqldefect);
        })
        .then((result) => {
            res.json(result.map((i) => i.Defect));
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/stackpn', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqlpart = `SELECT DISTINCT PartNo FROM vi_stack WHERE LEFT(PartNo,4)<>'UMGL' `;
            return queryFunc(connection, sqlpart);
        })
        .then((result) => {
            res.json(result.map((i) => i.PartNo));
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/stackprocess', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqlpart = `SELECT DISTINCT Process FROM viprocess`;
            return queryFunc(connection, sqlpart);
        })
        .then((result) => {
            res.json(result.map((i) => i.Process));
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/viipqc/prodclass', (req, res) => {

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqlStr = 'SELECT DISTINCT ProdClass FROM vi_yield';
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/viipqc/partnum/:ProdClass', (req, res) => {
    const { ProdClass } = req.params;

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqlStr = `SELECT DISTINCT PartNum FROM vi_yield WHERE ProdClass='${ProdClass}' ORDER BY PartNum`;
            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/viipqc/defect',(req,res)=>{ //找出
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sqlStr = `SELECT DISTINCT Defect FROM vi_defect ORDER BY Defect`;
            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
})


router.get('/viipqc/:ProdClass/:PartNum/:Defect/:st/:et', (req, res) => {
    const { ProdClass, PartNum, Defect, st, et } = req.params;
    
    mysqlConnection(configFunc('vi'))
        .then((connection) => {

            let filterStr = '';

            ProdClass
                ? prodStr = `AND ProdClass='${ProdClass}'`
                : prodStr = '';

            let partStr = '';

            if (PartNum !== "''") {
                const partAry = PartNum.split(',');

                if (partAry.length === 1) {
                    partStr = `AND PartNum='${partAry[0]}'`
                } else {

                    partStr = 'AND PartNum IN ('
                    partAry.forEach((p, idx) => {
                        idx === 0 ? partStr += `'${p}'` : partStr += `,'${p}'`
                    });
                    partStr += ')'
                }
            };

            prodStr === '' && partStr === ''
                ? filterStr = ''
                : filterStr = `${prodStr} ${partStr}`

            const sqlyieldStr = `SELECT ProdClass,PartNum,LotNum,Yield,ChangeTime,Week(ChangeTime)+1 Week,MONTH(ChangeTime) Month FROM vi_yield WHERE
            ChangeTime>='${timestampToYMDHIS(Number(st))}' AND ChangeTime<='${timestampToYMDHIS(Number(et))}'
            ${filterStr}`;

            // ChangeTime>= DATE_SUB(DATE_SUB(CURDATE(),INTERVAL DAY(CURDATE())-1 DAY),INTERVAL 6 MONTH)
            const sqldefectStr = `SELECT * FROM vi_defect WHERE LotNum IN 
            (SELECT DISTINCT LotNum FROM vi_yield WHERE
                ChangeTime>='${timestampToYMDHIS(Number(st))}' AND ChangeTime<='${timestampToYMDHIS(Number(et))}'
                ${filterStr}) AND Defect='${Defect}'`;

            const sqlspcStr = `SELECT * FROM vi_spc WHERE LotNum IN 
            (SELECT DISTINCT LotNum FROM vi_yield WHERE
                ChangeTime>='${timestampToYMDHIS(Number(st))}' AND ChangeTime<='${timestampToYMDHIS(Number(et))}'
                ${filterStr}) AND CtrlName='${Defect}'`;

            return Promise.all([
                queryFunc(connection, sqlyieldStr),
                queryFunc(connection, sqldefectStr),
                queryFunc(connection, sqlspcStr)
            ])
            ///生成LotNum去抓Defect和
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/vivrs2/:partnum/:st/:et', (req, res) => {
    const { partnum, st, et } = req.params;

    let connection;
    let dataAry = [];
    mysqlConnection(configFunc('vi'))
        .then((connect) => {
            // 取得批號
            connection = connect;
            const sqlStr = `SELECT PartNum,LotNum,ChangeTime,SQnty_S,ipqc_m,vrs1_m,ipqc_t,vrs2_deno FROM vi_vrs2  
            WHERE PartNum='${partnum}' ORDER BY ChangeTime DESC LIMIT 100`;
            // AND ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' 
            // AND '${timestampToYMDHIS2(Number(et))}'
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {

            dataAry = result;
            const lotStr = `'${result.map((i) => i.LotNum).join("','")}'`
            //取得相對應缺點
            const vrs2Str = `SELECT LotNum,BinCode,Count FROM vi_vrs2_defect WHERE LotNum IN (${lotStr})`;
            const othersStr = `SELECT LotNum,BinCode,Count FROM vi_vrs2_pe WHERE LotNum IN (${lotStr})`;

            return Promise.all([
                queryFunc(connection, vrs2Str),
                queryFunc(connection, othersStr),
            ])
        })
        .then((result) => {

            result[0].forEach((i) => {
                const index = dataAry.findIndex((d) => d.LotNum === i.LotNum);
                if (index !== -1) {
                    const { PartNum, ChangeTime, SQnty_S, ipqc_m, vrs1_m, ipqc_t, vrs2_deno } = dataAry[index];
                    i.PartNum = PartNum;
                    i.ChangeTime = ChangeTime;
                    i.SQnty_S = SQnty_S;
                    i.ipqc_m = ipqc_m;
                    i.vrs1_m = vrs1_m;
                    i.ipqc_t = ipqc_t;
                    i.vrs2_deno = vrs2_deno;
                }
            });

            result[1].forEach((i) => {
                const index = dataAry.findIndex((d) => d.LotNum === i.LotNum);
                if (index !== -1) {
                    const { PartNum, ChangeTime, SQnty_S, ipqc_m, vrs1_m, ipqc_t, vrs2_deno } = dataAry[index];
                    i.PartNum = PartNum;
                    i.ChangeTime = ChangeTime;
                    i.SQnty_S = SQnty_S;
                    i.ipqc_m = ipqc_m;
                    i.vrs1_m = vrs1_m;
                    i.ipqc_t = ipqc_t;
                    i.vrs2_deno = vrs2_deno;
                }
            });

            res.json({
                non_others: result[0],
                others: result[1]
            });
        })
        .catch((err) => {
            console.log(err);
        });
});

router.get('/overall/:partnum', (req, res) => {
    // 取得近100批Yield和批的others Rate
    const { partnum } = req.params
    let connection
    let dataAry = [];
    mysqlConnection(configFunc('vi'))
        .then((connect) => {
            connection = connect;
            const sql = `SELECT PartNo,LotNum,VIYield,Datatime FROM viyield WHERE PartNo='${partnum}' ORDER BY Datatime DESC LIMIT 100`;
            return queryFunc(connect, sql)
        })
        .then((result) => {
            dataAry = result;
            const lotStr = `'${result.map((i) => i.LotNum).join("','")}'`;

            const sql = `SELECT a.LotNum,a.ChangeTime,a.vrs2_deno,b.Count FROM vi_vrs2 a LEFT JOIN vi_vrs2_defect b ON a.LotNum=b.LotNum WHERE a.LotNum IN (${lotStr}) AND b.BinCode='others' ORDER BY ChangeTime`

            return queryFunc(connection, sql)
        })
        .then((result) => {

            result.forEach((r) => {
                const index = dataAry.findIndex((d) => d.LotNum === r.LotNum);
                if (index !== -1) {
                    const { VIYield, PartNo } = dataAry[index];
                    r.VIYield = VIYield;
                    r.PartNo = PartNo;
                    // d.Count = Count;
                } else {
                    r.VIYield = 0;
                    r.PartNo = PartNo
                    // d.Count = 0;
                }
            })

            // dataAry.forEach((d) => {
            //     const index = result.findIndex((r) => r.LotNum === d.LotNum);
            //     if (index !== -1) {
            //         const { vrs2_deno, Count } = result[index];
            //         d.vrs2_deno = vrs2_deno;
            //         d.Count = Count;
            //     } else {
            //         d.vrs2_deno = 0;
            //         d.Count = 0;
            //     }
            // });

            res.json(result.filter((r) => r.vrs2_deno !== 0 && r.VIYield !== 0));
        })
        .catch((err) => {
            console.log(err);
        })
})

router.get('/dailytable/:st/:et', (req, res) => {
    const { st, et } = req.params
    mysqlConnection(configFunc('vi'))
        .then((connection) => {

            const sql = `SELECT DISTINCT 
    ProdClass,
    PartNum,
    LotNum,
    LotType,
    Target,Triger,Yield,ChangeTime,top1,top1_rate,top2,top2_rate,top3,top3_rate,Remark FROM viyieldv2 y
    LEFT JOIN vi_target_triger t
    ON y.PartNum=t.ShortPart
    WHERE ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
    AND LEFT(LotType,2)<>'E3'`;
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})

router.get('/dailydevice', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT DISTINCT ProdClass FROM viyieldv2 WHERE ProdClass NOT IN ('','CPU')`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/dailytrend/:partnum/:st/:et', (req, res) => {
    const { partnum, st, et } = req.params
    let connect;
    let dataAry = [];
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            connect = connection
            const sql = `SELECT DISTINCT 
    ProdClass,
    PartNum,
    LotNum,
    LotType,
    Target,Triger,Yield,ChangeTime,top1,top1_rate,top2,top2_rate,top3,top3_rate FROM viyieldv2 y
    LEFT JOIN vi_target_triger t
    ON y.PartNum=t.ShortPart
    WHERE LEFT(PartNum,7)='${partnum}'
    AND ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
    AND LEFT(LotType,2)<>'E3'`
            return queryFunc(connect, sql)
        })
        .then((result) => {
            // 取得批號去抓VI各Defect
            // 如果批數大於100，則多10批
            // 少於100批補滿100
            dataAry = result;
            let filterCount = ''
            if (result.length > 100) {
                filterCount = 10
            } else {
                filterCount = 100 - result.length
            }

            let sql = `SELECT DISTINCT 
                ProdClass,
                PartNum,
                LotNum,
                LotType,
                ChangeTime,
                Target,Triger,Yield,top1,top1_rate,top2,top2_rate,top3,top3_rate FROM viyieldv2 y
                LEFT JOIN vi_target_triger t
                ON y.PartNum=t.ShortPart
                WHERE LEFT(PartNum,7)='${partnum}'
                AND ChangeTime <'${timestampToYMDHIS2(Number(st))}'
                AND LEFT(LotType,2)<>'E3' ORDER BY ChangeTime DESC LIMIT ${filterCount}`;
            return queryFunc(connect, sql)

        })
        .then((result) => {
            if (result) {
                dataAry = [...dataAry, ...result].sort((a, b) => new Date(a.ChangeTime) - new Date(b.ChangeTime))
            } else {
                dataAry = dataAry.sort((a, b) => new Date(a.ChangeTime) - new Date(b.ChangeTime))
            }

            const filterLot = `'${[...new Set(dataAry.map((i) => i.LotNum))].join("','")}'`
            const defectSql = `SELECT LotNum,Defect,Rate FROM videfectv2 WHERE LotNum IN (${filterLot})`

            return queryFunc(connect, defectSql)

        })
        .then((result) => {
            const defectAry = [...new Set(result.map((i) => i.Defect))]

            dataAry.forEach((i) => {
                const defectData = result.filter((d) => d.LotNum === i.LotNum)
                defectAry.forEach((d) => {
                    const index = defectData.findIndex((t) => t.LotNum === i.LotNum && t.Defect === d)
                    if (index !== -1) {
                        i[d] = defectData[index].Rate
                    } else {
                        i[d] = 0
                    }

                })

            })

            res.json({
                dataAry,
                defectAry
            })
        })
        .catch((err) => {
            console.log(err)
        })
})

router.get('/process', (req, res) => {

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT DISTINCT ProcNameE FROM vimachinev2 WHERE ProcNameE NOT IN ('')`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/defect', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT DISTINCT Defect FROM videfectv2 WHERE Defect NOT IN ('')`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/processdefect', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT Process,Defect,User,Time,Id FROM vitrendsave`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch(() => {
            res.json({
                status: false,
                message: '取得資料失敗'
            })
        })
})
router.get('/processaction', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT Process, Action, ActionTime,Color, User, Time, Id FROM viactionsave`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch(() => {
            res.json({
                status: false,
                message: '取得資料失敗'
            })
        })
})

router.post('/processdefect', (req, res) => {

    const { process, defect, userid, time, id } = req.body
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `INSERT INTO vitrendsave (Process, Defect, User, Time, Id) VALUES ('${process}','${defect}','${userid}','${timestampToYMDHIS2(new Date(time))}','${id}')`
            return queryFunc(connection, sql)
        })
        .then(() => {
            res.json({
                status: true,
                message: '新增資料完成'
            })
        })
        .catch(() => {
            res.json({
                status: false,
                message: '新增資料失敗'
            })
        })

})
router.post('/processaction', (req, res) => {
    const { process, action, actiontime, color, userid, time, id } = req.body
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `INSERT INTO viactionsave (Process, Action, ActionTime, Color,User, Time, Id) VALUES ('${process}','${action}','${timestampToYMDHIS2(Number(actiontime))}','${color}','${userid}','${timestampToYMDHIS2(new Date(time))}','${id}')`
            return queryFunc(connection, sql)
        })
        .then(() => {
            res.json({
                status: true,
                message: '新增資料完成'
            })
        })
        .catch(() => {
            res.json({
                status: false,
                message: '新增資料失敗'
            })
        })
})
router.put('/processdefect', (req, res) => {

    const { process, defect, userid, time, id } = req.body

    let columnStr = ''
    // 用時間去
    if (process) {
        columnStr += `Process='${process}',`

    }
    if (defect) {
        columnStr += `Defect='${defect}',`
    }

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `UPDATE vitrendsave SET ${columnStr} User='${userid}',Time='${timestampToYMDHIS2(new Date(time))}' 
            WHERE Id='${id}'`;
            return queryFunc(connection, sql)
        })
        .then(() => {
            res.json({
                status: true,
                message: '更新資料完成'
            })
        })
        .catch(() => {
            res.json({
                status: false,
                message: '更新資料失敗'
            })
        })
})

router.put('/processaction', (req, res) => {
    const { process, action, actiontime, color, userid, time, id } = req.body

    let columnStr = ''
    // 用時間去
    if (process) {
        columnStr += `Process='${process}',`
    }
    if (action) {
        columnStr += `Action='${action}',`
    }
    if (actiontime) {
        columnStr += `ActionTime='${timestampToYMDHIS2(new Date(actiontime))}',`
    }
    if (color) {
        columnStr += `Color='${color}',`
    }

    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `UPDATE viactionsave SET ${columnStr} User='${userid}',Time='${timestampToYMDHIS2(new Date(time))}' 
            WHERE Id='${id}'`;
            return queryFunc(connection, sql)
        })
        .then(() => {
            res.json({
                status: true,
                message: '更新資料完成'
            })
        })
        .catch(() => {
            res.json({
                status: false,
                message: '更新資料失敗'
            })
        })
})

router.delete('/processdefect/:id', (req, res) => {
    const { id } = req.params
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `DELETE FROM vitrendsave WHERE Id='${id}'`
            return queryFunc(connection, sql)
        })
        .then(() => {
            res.json({
                status: true,
                message: '刪除資料完成'
            })
        })
        .catch(() => {
            res.json({
                status: false,
                message: '刪除資料失敗'
            })
        })
})

router.delete('/processaction/:id', (req, res) => {
    const { id } = req.params
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `DELETE FROM viactionsave WHERE Id='${id}'`
            return queryFunc(connection, sql)
        })
        .then(() => {
            res.json({
                status: true,
                message: '刪除資料完成'
            })
        })
        .catch(() => {
            res.json({
                status: false,
                message: '刪除資料失敗'
            })
        })
})

router.get('/vitrendsave', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT Process,Defect,Time,Id FROM vitrendsave`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
});
// 根據點擊的Action&Defect取得對策
router.get('/viactionsave/:process', (req, res) => {
    const { process } = req.params
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT Process,Action,ActionTime,Color FROM viactionsave 
            WHERE Process='${process}'`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})

router.post('/viprocessdefecttrend', (req, res) => {
    const { partnum, process, defect } = req.body

    mysqlConnection(configFunc('vi'))
        .then((connection) => {

            const defectAry = defect.split(',')

            // let defectFilter = ''
            let promiseAry = []
            let sql = ''
            if (defectAry.length !== 0) {
                // 用,分有
                // defectFilter = `'${defect.split(',').join("','")}'`
                defectAry.forEach((d) => {
                    sql = `SELECT m.LotNum,m.ProcNameE,m.MachineName,m.ChangeTime,
                    CASE WHEN d.Defect IS NULL THEN '${d}' ELSE d.Defect END Defect,
                    CASE WHEN d.Rate IS NULL THEN '0' ELSE d.Rate END Rate FROM vimachinev2 m 
                    LEFT JOIN (SELECT LotNum,Defect,Rate FROM videfectv2 WHERE Defect = '${d}') d ON m.LotNum=d.LotNum
                    LEFT JOIN viyieldv2 y ON m.LotNum=y.LotNum
                    WHERE m.ProcNameE='${process}' AND y.PartNum='${partnum}' ORDER BY m.ChangeTime DESC LIMIT 200`

                    promiseAry.push(queryFunc(connection, sql))

                })
                return Promise.all(promiseAry)
            } else {
                defectFilter = `'${defect.split('+').join("','")}'`

                // Defect column 'S1+S2+S3'
                sql = `SELECT y.PartNum,m.LotNum,y.LotType,m.ProcNameE,m.MachineName,m.ChangeTime,Defect='${defect}',Sum(d.Rate)Rate FROM vimachinev2 m 
                LEFT JOIN videfectv2 d ON m.LotNum=d.LotNum
                LEFT JOIN viyieldv2 y ON m.LotNum=y.LotNum
                WHERE m.ProcNameE='${process}' 
                AND d.Defect IN (${defectFilter}) 
                AND y.PartNum='${partnum}' GROUP BY y.PartNum,m.LotNum,y.LotType,m.ProcNameE,m.MachineName,,m.ChangeTime  ORDER BY m.ChangeTime DESC LIMIT 200`
                return queryFunc(connection, sql)
            }

        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })

})

router.get('/viactionpermission', (req, res) => {
    mysqlConnection(configFunc('vi'))
        .then((connection) => {
            const sql = `SELECT uid FROM viactionpermission`
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/wipprocess', async (req, res) => {
    try {
//         const sql = `
//         SELECT DISTINCT left(p.ProcName,3) + CAST(m.BefDegree as char(1)) + right(p.ProcName,3) + CAST(m.BefTimes as char(1)) as value,left(p.ProcName,3) + CAST(m.BefDegree as char(1)) + right(p.ProcName,3) + CAST(m.BefTimes as char(1)) as label
// FROM PDL_CKHistory(nolock) m
// INNER JOIN ProcBasic(nolock) p ON m.proccode = p.ProcCode
// WHERE m.BefStatus = 'CheckIn'
// ORDER BY value`;
        const connection = await mysqlConnection(configFunc('vi'));
        const sql = `SELECT COLUMN_NAME as value,COLUMN_NAME as label FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'viyield' AND CHAR_LENGTH(COLUMN_NAME) = 8 AND COLUMN_NAME REGEXP '.*[0-9]$' ORDER BY label`;
        const result = await queryFunc(connection, sql);
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "資料查詢發生錯誤",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

  router.get('/viyield/:pn/:defect/:process/:st/:et', async (req, res) => {
    try {
        // 參數處理
        const { pn, defect, process, st, et } = req.params;
        // console.log(pn, defect, process, st, et);
        // 建立資料庫連接
        const connection = await mysqlConnection(configFunc('vi'));

        // 處理 PN 條件
        const pnCondition = pn==='xxx' ? '' : `AND PartNo='${pn}'`;
        // console.log('pnCondition',pnCondition);
        // const processTime = process +' '+ 'Time'
        // 轉換時間戳記
        const startTime = new Date(parseInt(st)).toISOString().slice(0, 19).replace('T', ' ');
        const endTime = new Date(parseInt(et)).toISOString().slice(0, 19).replace('T', ' ');

        // SQL 查詢
        let sql = `
            SELECT 
                PartNo,
                LotNum,
                LotType,
                Datatime,
                VIYield,
                '${defect}' AS Defect,
                \`${defect}\` As Rate,
                ${process},
                ${process}Time
            FROM viyield 
            WHERE ${process}Time 
            BETWEEN '${startTime}' AND '${endTime}' 
            ${pnCondition}
        `;
        // console.log(sql);
        // 執行查詢
        const rows = await queryFunc(connection, sql);

        // 關閉連接
        await connection.end();

        // 回傳結果
        res.json(rows);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            error: '資料查詢失敗',
            message: process.env.NODE_ENV === 'development' ? error.message : '請聯絡系統管理員'
        });
    }
});

module.exports = router;
