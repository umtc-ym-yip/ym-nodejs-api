const express = require('express');
const mongodb = require('mongodb');
const sql = require('mssql');
const mysql = require('mysql2');
const axios = require('axios');
const { configFunc } = require('../config.js')
const { mysqlConnection,queryFunc } = require('../mysql.js')
const router = express.Router();

const curDate = new Date()
curDate.setHours(8, 0, 0, 0);
const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);


curDate.setDate(curDate.getDate() - 1);
curDate.setHours(8, 0, 0, 0);
const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);






// 
const mongoURI = "mongodb://YMIBDIReader:" + encodeURIComponent("53s/62j6") + "@10.22.66.20:27017/?authSource=DatamationYM_IBDI";
const client = new mongodb.MongoClient(mongoURI);

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});
router.get('/aoimask', async (req, res) => {
    try {

        await client.connect();
        const mangos = await client
            .db('DatamationYM_IBDI')
            .collection('YM_Core_Bu_VRS_MaskPointTable_master')
            .find({ "Mask_True_Group": { $gte: 1 } })
            .toArray();

        // const lots = "('" + mangos.map((item) => item.Lot).join("','") + "')";

        const config = {
            user: 'dc',
            password: 'dc',
            server: '10.22.65.120',
            database: 'acme',
            options: {
                encrypt: false,
                trustServerCertificate: true,
            }
        };
        sql.connect(config, (err) => {
            if (err) { console.log(err) } else {
                const request = new sql.Request();
                request.query(`select  Rtrim(lotnum)Lot,a.layer,Rtrim(c.LayerName)LayerName,e.MachineName,ChangeTime from pdl_ckhistory a(nolock) 
                inner join numoflayer c(nolock) on a.layer = c.Layer
                inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid

                where proccode='LTH23' and BefStatus='MoveIn' and AftStatus='CheckIn' and AftTimes='1'`, (err, recordset) => {
                    if (err) { console.log(err) } else {


                        recordset.recordset.forEach((i) => {
                            const matchIndex = mangos.findIndex((o) => i.Lot === o.Lot && i.LayerName === '-' + o.ACME_Layer);

                            if (matchIndex === -1) {///沒固定點的資料
                                i.Status = 0;

                            } else {///反之

                                const lotLoc = mangos[matchIndex];

                                i.Lot_Layer = lotLoc.Lot_Layer;
                                i.Part_No = lotLoc.Part_No;
                                i.Mask_False_Group = lotLoc.Mask_False_Group;
                                i.Mask_Total_Group = lotLoc.Mask_Total_Group;
                                i.Mask_True_Group = lotLoc.Mask_True_Group;
                                i.Product = lotLoc.Product;
                                i.Side = lotLoc.Side;
                                i.Status = 1;
                            }
                        })

                        res.json(recordset.recordset);
                    }
                })
            }
        }
        );




    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'An error occurred' });
    } finally {
        client.close();
    }
});
router.get('/ProductDevice/', (req, res) => {
    let data = [];
    
    mysqlConnection(configFunc('paoi'))
    .then((conn) => {
        connection = conn;
        const sqldata = `Select Distinct ProdClass from ptaoi_yield_defect where PartNo not like ('%UMGL%') and left(LotType,2)<>'E3' order by ProdClass asc
        `;
        return queryFunc(connection, sqldata)
    })
    .then((result) => {  
        res.json(result)
    })
    .catch((err) => {
        console.log(err)
    });
});

router.get('/lottracking/:Device', (req, res) => {
    let data = [];
    const { Device } = req.params;
    console.log(req.params)
    mysqlConnection(configFunc('paoi'))
        .then((conn) => {
            connection = conn;
            const sqldata = `
        select distinct a2.ProdClass, note.InNote as Purpose, w.LotType, concat(w.PartNo,w.Rev) PN, a2.PartNo, aa.LotNum, w.Qnty Pnl, w.LayerName Layer, w.ProcNameE Process, w.VET,
            aa.1FB, aa.2FB, aa.3FB, aa.4FB, aa.5FB, aa.6FB, aa.7FB, aa.8FB, aa.9FB, aa.10FB, aa.11FB, aa.12FB, aa.Outer,
            ifnull(aa.1FB,1) * ifnull(aa.2FB,1) * ifnull(aa.3FB,1) * ifnull(aa.4FB,1) * ifnull(aa.5FB,1) * ifnull(aa.6FB,1) * ifnull(aa.7FB,1) * ifnull(aa.8FB,1) * ifnull(aa.9FB,1) * ifnull(aa.10FB,1) * ifnull(aa.11FB,1) * ifnull(aa.12FB,1) * ifnull(aa.Outer,1) as AOI, 
            Cast(f.Yield as decimal(6,4)) FLI_AOI, Cast(o.Yield as decimal(6,4)) OST_MP, Cast(ob.Yield as decimal(6,4)) OST_BD, 
            Cast(bum.Yield as decimal(6,4)) Bump, Cast(c.Yield as decimal(6,4)) CC, Cast(v.Yield as decimal(6,4)) VI, Cast(wpg.Yield as decimal(6,4)) LCOP, Cast(oay.Inline_yield as decimal(6,4)) OAY_Inline_yield
        from(
            Select 
                LotNum, 
                MAX(CASE WHEN FB = '1FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 1FB,
                MAX(CASE WHEN FB = '2FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 2FB,
                MAX(CASE WHEN FB = '3FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 3FB,
                MAX(CASE WHEN FB = '4FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 4FB,
                MAX(CASE WHEN FB = '5FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 5FB,
                MAX(CASE WHEN FB = '6FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 6FB,
                MAX(CASE WHEN FB = '7FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 7FB,
                MAX(CASE WHEN FB = '8FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 8FB,
                MAX(CASE WHEN FB = '9FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 9FB,
                MAX(CASE WHEN FB = '10FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 10FB,
                MAX(CASE WHEN FB = '11FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 11FB,
                MAX(CASE WHEN FB = '12FB' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as 12FB,
                MAX(CASE WHEN FB = '-Outer' THEN Cast(Yield as decimal(6,4)) ELSE NULL END) as \`Outer\`
            from paoi.aos a
            group by LotNum
        ) aa
        left join (select distinct ProdClass, LotNum, PartNo from paoi.ptaoi_yield_defect where ProdClass = '${Device}' and ProdClass is not null) a2 on aa.LotNum = a2.LotNum
        left join (select * from wip.innote) note on aa.LotNum = note.LotNum
        left join (select distinct LotNum, ProdClass, LotType, PartNo, Rev, Qnty, LayerName, ProcNameE, VET from wip.ym_wip) w on aa.LotNum = w.LotNum
        left join (select distinct LotNum, Yield from fli.fliyield) f on aa.LotNum = f.LotNum
        left join (select distinct lotno, Yield, type from paoi.ostyield) o on aa.LotNum = o.lotno and o.type = 'MP'
        left join (select distinct lotno, Yield, type from paoi.ostyield) ob on aa.LotNum = ob.lotno and ob.type = 'BD'
        left join (select distinct lotnum, Yield from bumpaoi.bumpyieldv2) bum on aa.LotNum = bum.lotnum
        left join (select distinct lotno, Yield from ccaoi.ccyieldv2) c on aa.LotNum = c.lotno
        left join (select distinct LotNum, Yield from vi.viyieldv2) v on aa.LotNum = v.LotNum
        left join (select distinct LotNum, Yield from wpg.wpgyield) wpg on aa.LotNum = wpg.LotNum
        left join (select distinct lotnum, OST_Yield, OST_BD_Yield, Bump_Yield, CC_Yield, VI_Yield, WPG_yield, Inline_yield, OAY_yield from oay.oayyield) oay on aa.LotNum = oay.lotnum
        where a2.ProdClass = '${Device}' order by PartNo, LotNum, PN 
        `;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        });
});

router.get('/getdevice', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sqlStr = `Select Distinct ProdClass from ptaoi_yield_defect where PartNo not like ('%UMGL%') and left(LotType,2)<>'E3' order by ProdClass asc
        `;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});

// router.get('/target', (req, res) => {
//     mysqlConnection(configFunc('paoi'))
//         .then((connection) => {
//             const sqlStr = 'SELECT PartNum PartNo, LayerName Layer, Target, Triger FROM aoi_target_trigger';
//             return queryFunc(connection, sqlStr);
//         })
//         .then((result) => {
//             const grouped = {};

//             result.forEach(item => {
//                 if (!grouped[item.PartNo]) {
//                     grouped[item.PartNo] = { PartNo: item.PartNo, Target: {}, Trigger: {} };
//                 }

//                 let fbKey;
//                 if (item.Layer === "-Outer") {
//                     fbKey = "Outer";
//                 } else {
//                     const match = item.Layer.match(/L(\d+)L(\d+)/);
//                     if (match) {
//                         const [_, start, end] = match;
//                         const fbNumber = Math.floor((parseInt(end) - parseInt(start) + 1) / 2);
//                         fbKey = `${fbNumber}FB`;
//                     }
//                 }

//                 if (fbKey) {
//                     // 處理 Target 值
//                     grouped[item.PartNo].Target[fbKey] = item.Target;

//                     // 處理 Trigger 值 (注意：原始列名是 'Triger'，可能是拼寫錯誤)
//                     grouped[item.PartNo].Trigger[fbKey] = item.Triger;
//                 }
//             });

//             const processedData = Object.values(grouped);
//             res.json(processedData);
//         })
//         .catch((err) => {
//             console.log(err);
//             res.status(500).json({ error: 'Internal Server Error' });
//         });
// });
router.get('/target', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sqlStr = 'SELECT PartNum PartNo, LayerName Layer, Target, Triger FROM aoi_target_trigger';
            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            const grouped = {};

            result.forEach(item => {
                if (!grouped[item.PartNo]) {
                    grouped[item.PartNo] = { PartNo: item.PartNo, Target: {}, Trigger: {} };
                }

                let fbKey;
                if (item.Layer === "-Outer") {
                    fbKey = "Outer";
                } else {
                    const match = item.Layer.match(/L(\d+)L(\d+)/);
                    if (match) {
                        const [_, start, end] = match;
                        const fbNumber = Math.floor((parseInt(end) - parseInt(start) + 1) / 2);
                        fbKey = `${fbNumber}FB`;
                    }
                }

                if (fbKey) {
                    // 處理 Target 值，取到小數點後兩位不進位
                    grouped[item.PartNo].Target[fbKey] = item.Target;

                    // 處理 Trigger 值，取到小數點後兩位不進位
                    grouped[item.PartNo].Trigger[fbKey] = item.Triger;
                }
            });

            const processedData = Object.values(grouped);
            res.json(processedData);
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ error: 'Internal Server Error' });
        });
});


// router.post('/updateData', (req, res) => {
//     const { LN, NewLN, Purpose, Outer } = req.body;
//     const fbValues = {};
//     for (let i = 1; i <= 11; i++) {
//         fbValues[`FB${i}`] = req.body[`${i}FB`];
//     }

//     mysqlConnection(configFunc('wip'))
//         .then((connection) => {
//             const sqlStr = `INSERT INTO wip_update 
//                 (LN, NewLN, Purpose, 1FB, 2FB, 3FB, 4FB, 5FB, 6FB, 7FB, 8FB, 9FB, 10FB, 11FB, \`Outer\`) 
//                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//                 ON DUPLICATE KEY UPDATE
//                 NewLN = VALUES(NewLN),
//                 Purpose = VALUES(Purpose),
//                 1FB = VALUES(1FB),
//                 2FB = VALUES(2FB),
//                 3FB = VALUES(3FB),
//                 4FB = VALUES(4FB),
//                 5FB = VALUES(5FB),
//                 6FB = VALUES(6FB),
//                 7FB = VALUES(7FB),
//                 8FB = VALUES(8FB),
//                 9FB = VALUES(9FB),
//                 10FB = VALUES(10FB),
//                 11FB = VALUES(11FB),
//                 \`Outer\` = VALUES(\`Outer\`)
//             `;
//             const values = [
//                 LN,
//                 NewLN,
//                 Purpose,
//                 fbValues.FB1, fbValues.FB2, fbValues.FB3, fbValues.FB4, fbValues.FB5, 
//                 fbValues.FB6, fbValues.FB7, fbValues.FB8, fbValues.FB9, fbValues.FB10, 
//                 fbValues.FB11, 
//                 Outer
//             ];
//             return queryFunc(connection, sqlStr, values);
//         })
//         .then((result) => {
//             if (result.affectedRows > 0) {
//                 res.json({ success: true, message: '資料更新成功' });
//             } else {
//                 res.json({ success: false, message: '找不到對應的批號' });
//             }
//         })
//         .catch((err) => {
//             console.log(err);
//             res.status(500).json({ success: false, message: '資料庫錯誤' });
//         });
// });

router.post('/updateData', (req, res) => {
    const { LN, NewLN, Purpose, Outer, ...fbValues } = req.body;

    mysqlConnection(configFunc('wip'))
        .then((connection) => {
            // 首先检查是否存在记录
            const checkSql = 'SELECT * FROM wip_update WHERE LN = ?';
            return queryFunc(connection, checkSql, [LN])
                .then(results => {
                    if (results.length > 0) {
                        // 记录存在，执行更新
                        const updateFields = [];
                        const updateValues = [];

                        // 只更新提供的非空值
                        if (NewLN !== undefined && NewLN !== '') {
                            updateFields.push('NewLN = ?');
                            updateValues.push(NewLN);
                        }
                        if (Purpose !== undefined && Purpose !== '') {
                            updateFields.push('Purpose = ?');
                            updateValues.push(Purpose);
                        }
                        if (Outer !== undefined && Outer !== '') {
                            updateFields.push('`Outer` = ?');
                            updateValues.push(Outer);
                        }

                        // 处理 FB 值
                        for (let i = 1; i <= 12; i++) {
                            const fbKey = `${i}FB`;
                            if (fbValues[fbKey] !== undefined && fbValues[fbKey] !== '') {
                                updateFields.push(`${fbKey} = ?`);
                                updateValues.push(fbValues[fbKey]);
                            }
                        }

                        if (updateFields.length === 0) {
                            return { affectedRows: 0 }; // 没有需要更新的字段
                        }

                        const updateSql = `
                            UPDATE wip_update 
                            SET ${updateFields.join(', ')}
                            WHERE LN = ?
                        `;
                        updateValues.push(LN);
                        return queryFunc(connection, updateSql, updateValues);
                    } else {
                        // 记录不存在，执行插入
                        const insertFields = ['LN'];
                        const insertValues = [LN];
                        const placeholders = ['?'];

                        if (NewLN !== undefined && NewLN !== '') {
                            insertFields.push('NewLN');
                            insertValues.push(NewLN);
                            placeholders.push('?');
                        }
                        if (Purpose !== undefined && Purpose !== '') {
                            insertFields.push('Purpose');
                            insertValues.push(Purpose);
                            placeholders.push('?');
                        }
                        if (Outer !== undefined && Outer !== '') {
                            insertFields.push('`Outer`');
                            insertValues.push(Outer);
                            placeholders.push('?');
                        }

                        // 处理 FB 值
                        for (let i = 1; i <= 12; i++) {
                            const fbKey = `${i}FB`;
                            if (fbValues[fbKey] !== undefined && fbValues[fbKey] !== '') {
                                insertFields.push(fbKey);
                                insertValues.push(fbValues[fbKey]);
                                placeholders.push('?');
                            }
                        }

                        const insertSql = `
                            INSERT INTO wip_update 
                            (${insertFields.join(', ')}) 
                            VALUES (${placeholders.join(', ')})
                        `;
                        return queryFunc(connection, insertSql, insertValues);
                    }
                });
        })
        .then((result) => {
            if (result.affectedRows > 0) {
                res.json({ success: true, message: '資料更新或插入成功' });
            } else {
                res.json({ success: false, message: '沒有更改任何資料' });
            }
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ success: false, message: '資料庫錯誤' });
        });
});

router.get('/getUpdateData', (req, res) => {
    mysqlConnection(configFunc('wip'))
        .then((connection) => {
            const sqlStr = `SELECT * FROM wip_update `;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});


module.exports = router
