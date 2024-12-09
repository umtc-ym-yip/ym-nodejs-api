const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');
const fs = require('fs');
const { poolAcme, poolDc, poolNCN, poolMetrology } = require('../mssql');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS, timestampToYMDHIS2 } = require('../time.js');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/dailytable/:st/:et', (req, res) => {
    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            const { st, et } = req.params
            const sql = `SELECT DISTINCT * FROM 
            bumpyieldv2 c 
            LEFT JOIN 
            bump_target_triger t 
            ON LEFT(c.partnum,7)=t.ShortPart 
            WHERE ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}' 
            AND LEFT(lot_type,2) <> 'E3'
            AND Left(c.partnum,4)<>'UMGL'
            ORDER BY ChangeTime
            `;
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
});

router.get('/dailydevice', (req, res) => {
    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            const sql = `SELECT DISTINCT ProdClass FROM bumpyieldv2 
        WHERE ProdClass!=''`
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
    const { partnum, st, et } = req.params;
    let connect;
    let dataAry = [];
    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            connect = connection
            const sql = `SELECT DISTINCT * FROM 
            bumpyieldv2 c 
            LEFT JOIN 
            bump_target_triger t 
            ON LEFT(c.partnum,7)=t.ShortPart
            WHERE 
            LEFT(lot_type,2) <> 'E3'
            AND Left(c.partnum,7)='${partnum}'
            AND Left(c.partnum,4)<>'UMGL'
            AND ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
            ORDER BY ChangeTime`;
            return queryFunc(connection, sql)
        })
        .then((result) => {
            dataAry = result;

            let filterCount = 0
            if (result.length > 100) {
                filterCount = 10
            } else {
                filterCount = 100 - result.length
            }
            let sql = `SELECT DISTINCT * FROM 
            bumpyieldv2 c 
            LEFT JOIN 
            bump_target_triger t 
            ON LEFT(c.partnum,7)=t.ShortPart 
            WHERE 
            LEFT(lot_type,2) <> 'E3'
            AND Left(c.partnum,7)='${partnum}'
            AND Left(c.partnum,4)<>'UMGL'
            AND ChangeTime < '${timestampToYMDHIS2(Number(st))}'
            ORDER BY ChangeTime DESC LIMIT ${filterCount}`

            return queryFunc(connect, sql)

            // res.json(result)
        })
        .then((result) => {

            if (result) {
                dataAry = [...dataAry, ...result].sort((a, b) => new Date(a.ChangeTime) - new Date(b.ChangeTime))
            } else {
                dataAry = dataAry.sort((a, b) => new Date(a.ChangeTime) - new Date(b.ChangeTime))
            }
            const filterLot = `'${[...new Set(dataAry.map((i) => i.lotnum))].join("','")}'`;
            const defectSql = `SELECT LotNum,Defect,Rate FROM bumpdefectv2 WHERE LotNum IN (${filterLot})`;

            return queryFunc(connect, defectSql)
        })
        .then((result) => {
            const defectAry = [...new Set(result.map((i) => i.Defect))]
            dataAry.forEach((i) => {
                const defectData = result.filter((d) => d.lotnum === i.LotNum)
                defectAry.forEach((d) => {
                    const index = defectData.findIndex((t) => t.LotNum === i.lotnum && t.Defect === d)
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

router.get('/dailymapping', (req, res) => {

    const { lot, defect } = req.query

    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            const sql = `SELECT PartNo,LotNum,Panel,Unit_X,Unit_Y,Defect FROM bumpmapv2 
        WHERE LotNum='${lot}' AND Defect='${defect}'`;
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})

router.get('/dailympltxy/:partnum', (req, res) => {
    const { partnum } = req.params;
    // console.log(partnum)
    const sql = `SELECT DISTINCT  
    MpLtX*2 MpX,
    MpLtY*2 MpY
    FROM YM_Layout_Center_Head a(nolock)
    LEFT JOIN YM_FilmPart_Map b(nolock)
    ON a.Jobname=b.FilmPart
    WHERE AcmePart like '${partnum}%'`;

    poolDc.query(sql)
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/dailyboard/:lot', (req, res) => {
    const { lot } = req.params
    console.log(lot)
    // const sql = `SELECT DISTINCT Panel FROM V_Bump_Unit_YM WHERE LotNum='${lot}'`;
    // poolMetrology.query(sql)
    const sql=`SELECT distinct right(PanelID,2) Panel          
                          from YM_ULT_UnitBase(nolock) where LotNum='${lot}'`
    poolDc.query(sql)
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err)
        })
})

router.get('/dailydefecttrend', (req, res) => {
    const { partnum, defect } = req.query
    const lotCount = 300;
    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            const sql = `SELECT t.partnum,t.lotnum,lot_type,Uball,Uball_Time,
            CASE WHEN Defect IS NULL THEN '${defect}' ELSE Defect END Defect,
            CASE WHEN Rate IS NULL THEN '0' ELSE Rate END Rate FROM
            (SELECT partnum,lotnum,lot_type,Uball,Uball_Time FROM bumpyieldv2 y 
                WHERE LEFT(y.partnum,7)='${partnum}' ORDER BY y.Uball_Time LIMIT ${lotCount})t
            LEFT JOIN  (SELECT LotNum,Defect,Rate FROM bumpdefectv2 WHERE Defect='${defect}' )m ON t.lotnum = m.LotNum
            `
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/dailydefectitem', (req, res) => {
    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            const sql = `SELECT DISTINCT Defect FROM bumpdefectv2`;
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err)
        })
})

router.get('/dailysflink', (req, res) => {
    const sql = `SELECT 
    DISTINCT LEFT(partNum,7)PN,
    ULMark94V,NumOfLayer/2  lotlayer
    FROM prodbasic(nolock) 
    WHERE UlMark94V<>'' 
    AND LEFT(partNum,2)<>'UM'`
    poolAcme.query(sql)
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        })
})

// stack
router.get('/weeklystackdata', (req, res) => {
    const { partnum, defect } = req.query;

    let yieldData = [];
    let lotArray = [];

    let weekArray = [];
    let weekData = [];
    let lotStr = '';
    let connect;
    mysqlConnection(configFunc('bumpaoi'))
        .then((connection) => {
            connect = connection;
            const sqlStr = `SELECT
            YEARWEEK(ChangeTime,0) Week,LEFT(partnum,7)PartNum,lotnum LotNum,lot_type
            ,ChangeTime,Cast(Yield as real)Yield,Uball
        FROM bumpyieldv2
        WHERE 
        YEARWEEK(ChangeTime,0)>=YEARWEEK(CURDATE()-INTERVAL 9 WEEK,0)
        AND YEARWEEK(ChangeTime,0)<=YEARWEEK(CURDATE(),0)
        AND LEFT(partnum,7)='${partnum}'
        AND Yield <> '0' 
        AND LEFT(partnum,4) <> 'UMGL' 
        AND LEFT(lot_type,2) NOT IN ('E3') ORDER BY ChangeTime DESC`;

            return queryFunc(connect, sqlStr)
        })
        .then((result) => {
            // 找出近10週的所有批號
            // 批號/Machine->Defect
            // 根據該週批號有的缺點生成  Week,PartNo,UnitX,UnitY,Machine,Defect

            yieldData = result;
            lotArray = [...new Set(result.map((i) => i.LotNum))];
            // machineArray = [...new Set(result.map((i) => i.Uball))];
            weekArray = [...new Set(result.map((i) => i.Week))]; //[{Week:202416,LotNum:[dasdada]}]

            weekArray.forEach((w) => {

                const data = yieldData.filter((y) => y.Week === w)
                weekData.push({
                    Week: w,
                    Machine: data.map((y) => y.Uball),
                    LotNum: data.map((y) => y.LotNum),
                });
            })
            lotStr = `'${lotArray.join("','")}'`;
            // 取得Rate 上圖用
            const sqlStr1 = `SELECT PartNum,LotNum,Defect,Rate FROM bumpdefectv2 
            WHERE LotNum IN (${lotStr}) ${defect === 'All' ? '' : `AND Defect='${defect}'`}`;
            // 取得UnitX,UnitY 下圖用
            const sqlStr2 = `SELECT PartNo,LotNum,Panel,Unit_X,Unit_Y,Defect FROM bumpmapv2 
            WHERE LotNum IN (${lotStr}) ${defect === 'All' ? '' : `AND Defect='${defect}'`}`;

            // 取得
            const sqlHead = `SELECT DISTINCT  
            MpLtX*2 MpX,
            MpLtY*2 MpY
            FROM YM_Layout_Center_Head a(nolock)
            LEFT JOIN YM_FilmPart_Map b(nolock)
            ON a.Jobname=b.FilmPart
            WHERE LEFT(b.AcmePart,7)='${partnum}'`
            const sqlTotal = `SELECT LotNum,Unit_X,Unit_Y,Count(*)Count FROM V_Bump_Unit_YM WHERE LotNum IN (${lotStr}) GROUP BY LotNum,Unit_X,Unit_Y`;
            return Promise.all([
                queryFunc(connect, sqlStr1),
                queryFunc(connect, sqlStr2),
                poolDc.query(sqlHead),
                poolMetrology.query(sqlTotal),
            ])
        })
        .then((result) => {

            const defectData = result[0];
            const unitXYData = result[1];
            const { MpX, MpY } = result[2].recordset[0];
            const mpxArray = Array.from({ length: MpX }, (_, index) => index + 1);
            const mpyArray = Array.from({ length: MpY }, (_, index) => index + 1);
            const unitXYCount = result[3].recordset;

            // const weeklystack = [];
            // 要知道各週有哪些Lot
            yieldData.forEach((y) => {
                const index = defectData.findIndex((d) => d.LotNum === y.LotNum);
                if (index !== -1) {
                    y.Rate = defectData[index].Rate;
                } else {
                    y.Rate = 0;
                }
            });
            const weeklystackData = [];

            weekData.forEach((w) => {
                // 去計算同一UnitX,UnitY總顆數
                // const weekData = yieldData.filter((y) => y.Week === w);
                const machineArray = [...new Set(w.Machine)];
                machineArray.forEach((m) => {
                    const matchIndex = w.Machine
                        .map((i, idx) => i === m ? idx : -1)
                        .filter((i) => i !== -1);

                    const mappingData = unitXYData
                        .filter((u) => matchIndex.map((i) => w.LotNum[i]).includes(u.LotNum));
                    const totalData = unitXYCount
                        .filter((u) => matchIndex.map((i) => w.LotNum[i]).includes(u.LotNum));

                    mpxArray.forEach((x) => {
                        mpyArray.forEach((y) => {

                            const matchCount = mappingData.filter((u) =>
                                Number(u.Unit_X) === x
                                &&
                                Number(u.Unit_Y) === y
                            ).length;

                            const totalCount = totalData.filter((u) =>
                                Number(u.Unit_X) === x
                                &&
                                Number(u.Unit_Y) === y
                            )
                                .map((i) => i.Count)
                                .reduce((a, b) => a + b, 0);

                            weeklystackData.push({
                                Week: w.Week,
                                Unit_X: x,
                                Unit_Y: y,
                                Machine: m,
                                Rate: (matchCount / totalCount).toFixed(4)
                            });

                        })
                    })

                })
            });

            res.json({
                yieldData,
                weeklystackData,
            })
        })
        .catch((err) => {
            console.log(err)
        })
})
router.get('/dailyinlineyield/:lotnum', async (req, res) => {
    try {
      let { lotnum } = req.params;
    //   lotnum = lotnum.slice(1).replace(/-/g, '');
    //   console.log(lotnum);
  
      const connection = await mysqlConnection(configFunc('bumpaoi'));
  
    //   const sql = `
    //     SELECT DISTINCT *, 
    //     CAST((CAST(RIGHT(MPID, 1) AS DECIMAL(10,2)) + 1) / 2 AS SIGNED) AS Quad 
    //     FROM bumpinlineyield 
    //     WHERE left(MPID,11)='${lotnum}'
    //   `;
//     const sql = `
//     SELECT *        
//    FROM bumpinlineyieldv2 where lotNum='${lotnum}'
//     `
    let sql = `
    SELECT 
    t1.MPID,              -- 明確使用 t1 的 MPID
    t1.*,
    t2.PartNo,
    t2.LotNum,
    t2.has_3D_error_code,
    t2.missing_feature,
    t2.3D_Missing_Bump,
    t2.3D_Bump_height_hi,
    t2.3D_Max_delta_height,
    t2.Bump_CopL,
    t2.TotalCount
FROM (SELECT *        
  FROM bumpinlineyieldv2 where lotNum='${lotnum}') t1
left JOIN (SELECT 
        PartNo, 
        LotNum, 
        MPID,
        SUM(CASE WHEN Defect = 'has 3D error code' THEN 1 ELSE 0 END) AS 'has_3D_error_code',
        SUM(CASE WHEN Defect = 'missing feature' THEN 1 ELSE 0 END) AS 'missing_feature',
        SUM(CASE WHEN Defect = '3D / Missing Bump' THEN 1 ELSE 0 END) AS '3D_Missing_Bump',
        SUM(CASE WHEN Defect = '3D / Bump height hi' THEN 1 ELSE 0 END) AS '3D_Bump_height_hi',
        SUM(CASE WHEN Defect = '3D / Max. delta height' THEN 1 ELSE 0 END) AS '3D_Max_delta_height',
        SUM(CASE WHEN Defect = 'coplanarity regression over limit' THEN 1 ELSE 0 END) AS 'Bump_CopL',
        COUNT(*) AS TotalCount
  FROM bumpmapv2
  WHERE LotNum='${lotnum}'
  GROUP BY PartNo, LotNum, MPID) t2
    ON trim(t1.MPID) = trim(t2.MPID)    
  `;
  
//       const sql = `
//         SELECT t1.*, 
//                 t2.*
// FROM (SELECT *,
//              CAST((CAST(RIGHT(MPID, 1) AS DECIMAL(10,2)) + 1) / 2 AS SIGNED) AS Quad 
//       FROM bumpinlineyield where left(MPID,11)='${lotnum}') t1
// INNER JOIN (SELECT 
//             PartNo, 
//             LotNum, 
//             MPID,
//             SUM(CASE WHEN Defect = 'has 3D error code' THEN 1 ELSE 0 END) AS 'has_3D_error_code',
//             SUM(CASE WHEN Defect = 'missing feature' THEN 1 ELSE 0 END) AS 'missing_feature',
//             SUM(CASE WHEN Defect = '3D / Missing Bump' THEN 1 ELSE 0 END) AS '3D_Missing_Bump',
//             SUM(CASE WHEN Defect = '3D / Bump height hi' THEN 1 ELSE 0 END) AS '3D_Bump_height_hi',
//             SUM(CASE WHEN Defect = '3D / Max. delta height' THEN 1 ELSE 0 END) AS '3D_Max_delta_height',
//             SUM(CASE WHEN Defect = 'coplanarity regression over limit' THEN 1 ELSE 0 END) AS 'Bump_CopL',
//             COUNT(*) AS TotalCount
//       FROM bumpmapv2
//       WHERE MPID <> ''
//       AND LEFT(MPID,11)='${lotnum}'
//       GROUP BY PartNo, LotNum, MPID) t2
//         ON t1.MPID = t2.MPID    
//       `;
  
      const result = await queryFunc(connection, sql);
    //   result.forEach(item => {
    //     item.has_3D_error_code = item.has_3D_error_code || 0;
    //     item.missing_feature = item.missing_feature || 0;
    //     item['3D_Missing_Bump'] = item['3D_Missing_Bump'] || 0;
    //     item['3D_Bump_height_hi'] = item['3D_Bump_height_hi'] || 0;
    //     item['3D_Max_delta_height'] = item['3D_Max_delta_height'] || 0;
    //     item['Bump_CopL'] = item['Bump_CopL'] || 0;
    //   })
      res.json(result);
  
      // Close the connection
      await connection.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred while processing your request." });
    }
  });

router.get('/test', async (req, res) => {
    try {
       
      const connection = await mysqlConnection(configFunc('bumpaoi'));
  
    //   const sql = `
    //     SELECT PartNo,LotNum,Defect,MPID,COUNT(*) AS Count  FROM bumpmapv2  Where MPID<>'' Group By PartNo, LotNum, Defect, MPID`;
      const sql=`SELECT 
    PartNo, 
    LotNum, 
    MPID,
    SUM(CASE WHEN Defect = 'has 3D error code' THEN 1 ELSE 0 END) AS 'has 3D error code',
    SUM(CASE WHEN Defect = 'size X over limit' THEN 1 ELSE 0 END) AS 'size X over limit',
    SUM(CASE WHEN Defect = 'missing feature' THEN 1 ELSE 0 END) AS 'missing feature',
    SUM(CASE WHEN Defect = '3D / Missing Bump' THEN 1 ELSE 0 END) AS '3D / Missing Bump',
    SUM(CASE WHEN Defect = '3D / Min. delta height' THEN 1 ELSE 0 END) AS '3D / Min. delta height',
    SUM(CASE WHEN Defect = '3D / Bump height hi' THEN 1 ELSE 0 END) AS '3D / Bump height hi',
    SUM(CASE WHEN Defect = '3D / Bad Bump' THEN 1 ELSE 0 END) AS '3D / Bad Bump',
    SUM(CASE WHEN Defect = '3D / Bump height low' THEN 1 ELSE 0 END) AS '3D / Bump height low',
    SUM(CASE WHEN Defect = '3D / Jig Vacuum' THEN 1 ELSE 0 END) AS '3D / Jig Vacuum',
    SUM(CASE WHEN Defect = '3D / inspection error' THEN 1 ELSE 0 END) AS '3D / inspection error',
    SUM(CASE WHEN Defect = '3D / RCTV' THEN 1 ELSE 0 END) AS '3D / RCTV',
    SUM(CASE WHEN Defect = '3D / RBTV_CtB' THEN 1 ELSE 0 END) AS '3D / RBTV_CtB',
    SUM(CASE WHEN Defect = '3D / RBTV' THEN 1 ELSE 0 END) AS '3D / RBTV',
    SUM(CASE WHEN Defect = '3D / bump height ave.' THEN 1 ELSE 0 END) AS '3D / bump height ave.',
    SUM(CASE WHEN Defect = '3D / Max. delta height' THEN 1 ELSE 0 END) AS '3D / Max. delta height',
    SUM(CASE WHEN Defect = '2DID NG' THEN 1 ELSE 0 END) AS '2DID NG',
    SUM(CASE WHEN Defect = '3D / CTV' THEN 1 ELSE 0 END) AS '3D / CTV',
    SUM(CASE WHEN Defect = 'size X under limit' THEN 1 ELSE 0 END) AS 'size X under limit',
    SUM(CASE WHEN Defect = 'height under limit' THEN 1 ELSE 0 END) AS 'height under limit',
    SUM(CASE WHEN Defect = 'height over limit' THEN 1 ELSE 0 END) AS 'height over limit',
    SUM(CASE WHEN Defect = 'has 2D error code' THEN 1 ELSE 0 END) AS 'has 2D error code',
    SUM(CASE WHEN Defect = 'coplanarity regression over limit' THEN 1 ELSE 0 END) AS 'coplanarity regression over limit',
    SUM(CASE WHEN Defect = 'Other' THEN 1 ELSE 0 END) AS 'Other',
    COUNT(*) AS TotalCount
        FROM bumpmapv2
WHERE MPID <> ''
GROUP BY PartNo, LotNum, MPID`;
      const result = await queryFunc(connection, sql);
      res.json(result);
  
      // Close the connection
      await connection.end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "An error occurred while processing your request." });
    }
  });


module.exports = router
