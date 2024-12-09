// const express = require('express');
// const mongodb = require('mongodb');
// const sql = require('mssql');
// const mysql=require('mysql2');
// const { poolBga } = require('../mssql.js')
// const { configFunc } = require('../config.js')
// const { mysqlConnection,queryFunc } = require('../mysql.js')
// // const axios = require('axios');

// const router = express.Router();

// const curDate = new Date()
// curDate.setHours(8, 0, 0, 0);

// // mongo
// const mongoURI = "mongodb://datamationYM:P%40ssw0rd@utcymmgs01.unimicron.com:27017/?authSource=DatamationYM_AIOT";
// // const client = new mongodb.MongoClient(mongoURI);

// router.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', '*');
//     res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
//     res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
//     res.setHeader('Access-Control-Allow-Credentials', true);
//     next();
// });
// router.get('/wipym', (req, res) => {
//     let connect;
//     let data = [];
//     let Ary = [];
//     poolBga.query(`SELECT distinct * from WIP_YM(nolock)`)
//     .then((result) => {
//         data = result[0].recordset;        
//         return mysqlConnection(configFunc('wip'));
//     })
//     .then((connection) => {
//         connect=connection;
//         data.forEach((i)=>{
//             const values=Object.values(i);
//             const temp_v = [];
//             values.forEach((j, index) => { // 改null => ''
//                 if(j === null){
//                     temp_v[index] = ''
//                 }else{
//                     temp_v[index] = j
//                 }
//             });
//             Ary.push(temp_v);
//         });
//         const sql_re="Delete From wip_ym";

//         return queryFunc(connection,sql_re);

//     })
//     .then((result)=>{

//         const sql="Insert into wip_ym Values ?";

//         return queryFunc(connect,sql,[Ary]);
//     })
//     .then((result)=>{
//         console.log('WIP更新完成', Ary.length, '筆');
//     })
//     .catch((err) => {
//         console.log(err)
//     });
// })

// module.exports = router

const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS } = require('../time');
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

router.get('/wipupdate', (req, res) => {

    const ABFplusAry = ['ABFCLN', 'ABFNOV', 'ABFNCL', 'ABFCPO', 'ABFCZO', 'ABFPOS', 'ABFPTO', 'ABFPVC', 'ABFMEC', 'ABFBZO', 'ABFIPW', 'ABFMPO', 'ABFABF'];
    const CoreexceptionAry = ['AOI1VRS1', 'LDL1PLF1', 'LDL1COL1', 'PTH7SAC1', 'AOI1AOS1'];
    mysqlConnection(configFunc('wip'))
        .then((connect) => {

            const sqlWip = `
            With dt As (SELECT lotnum,Max(ChangeTime)Time FROM PDL_CKhistory a(nolock) GROUP BY lotnum)
        
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
            WHERE LEFT(h.partnum,2)<>'UM' 
            `;
            // AND (h.proccode<>'FVI19' AND (AftStatus='MoveOut' OR AftStatus='CheckOut'))
            const sqlControl = `SELECT * FROM process_control`;

            const sqlCount = `SELECT LotNum,Count(*)RLSCount,SUM(CASE WHEN Scrapped='1' THEN 1 ELSE 0 END)AS ScrapCount FROM YM_ULT_UnitBase(nolock) GROUP BY LotNum`;

            return Promise.all([poolAcme.query(sqlWip), queryFunc(connect, sqlControl), poolDc.query(sqlCount)]);
        })
        .then((result) => {
            const wipData = result[0].recordset;
            const controlData = result[1];
            const countData = result[2].recordset;

            wipData.forEach((i, index) => {

                // 補上Count
                const countIdx = countData.findIndex((c) => c.LotNum === i.LotNum);
                if (countIdx !== -1) {
                    i.RLSCount = countData[countIdx].RLSCount;
                    i.ScrapCount = countData[countIdx].ScrapCount;
                } else {
                    i.RLSCount = '';
                    i.ScrapCount = '';
                }

                // 

                // VET 
                i.VET = ((new Date().getTime() - new Date(i.ChangeTime).getTime()) / 1000 / 60 / 60).toFixed(1);
                // 

                if (i.LayerName !== '-Outer') {
                    const layerAry = i.LayerName.split('L');
                    i.NumOfLayer = ((Number(layerAry[2]) - Number(layerAry[1])) + 1) / 2;
                } 
                else {
                    i.NumOfLayer = Number(i.NumOfLayer/2);///表示Outer
                }

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

                    if (i.ProcName === 'PTHIPQ' && i.NumOfLayer>1) {
                        i.procGroup = 'AOI';
                        i.lgroup = 'BU-Outer';
                    } else if (i.ProcName === 'PTHIPQ' && i.NumOfLayer===1) {
                        i.procGroup = 'AOI';
                        i.lgroup = 'Core';
                    }

                    // PTHIPQ   AOI Core
                    // PTHIPQ   AOI BU-Outer


                    if ((i.lgroup === 'BU-Outer' || i.lgroup === 'BU') && i.LayerName === '-Outer') {//排除BE SMK
                        // i.layerGroup = i.lgroup; 原本
                        i.layerGroup=`BU${i.NumOfLayer - 1}`;
                    } else if (i.lgroup === 'BU-Outer' || i.lgroup === 'BU') {

                        const layerAry = i.LayerName.split('L');

                        // i.layerGroup = ABFplusAry.includes(i.ProcName) && layerAry[1] === '2'
                        //     ? `BU-Outer`
                        //     : ABFplusAry.includes(i.ProcName) && layerAry[1] !== '2'
                        //         ? `BU${i.NumOfLayer}`  ///除了ABFplusAry中的，其他都應該-1 ex BU1->2FB ,BU2->3FB(L3L8)
                        //         : `BU${i.NumOfLayer - 1}`;
                        if (ABFplusAry.includes(i.ProcName) && layerAry[1] === '2') {///ABF站點且-L2
                            // i.layerGroup = 'BU-Outer';原本
                            i.layerGroup=`BU${i.NumOfLayer - 1}`;
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

            res.json(
                {
                    wip: {
                        data: wipData,
                        db: 'wip',
                        table: 'ym_wip',
                        match: [`ProdClass`,`LayerName`, `NumOfLayer`, `LotType`, `Qnty`,`RLSCount`,`ScrapCount`,`proccode`, `ProcName`, `ProcNameE`, `BefStatus`, `AftStatus`, `ChangeTime`, `VET`, `procGroup`, `lgroup`, `layerGroup`]
                    }
                }
            );

        })
        .catch((err) => {
            console.log(err);
        })

});


module.exports = router;

