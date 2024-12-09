const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');
const fs = require('fs');
const { poolAcme, poolDc, poolNCN } = require('../mssql');
 
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS, timestampToYMDHIS2 } = require('../time.js');
 
const router = express.Router();
 
router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',req.header('Origin'));
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});
 
router.get('/getinfo/:part', (req, res) => { ///
    const {part} = req.params;
    //  device, 
    mysqlConnection(configFunc('product'))
        .then((connection) => {
 
            const sqlStr = `SELECT t1.ProcName,t1.Device,t1.PartNo,t1.GoldenLine,t1.Backup,t1.Time FROM production_list t1 
            INNER JOIN
            (SELECT ProcName,Device,PartNo,MAX(Time)Time FROM production_list 
            GROUP BY ProcName,Device,PartNo
            )t2 ON t1.ProcName=t2.ProcName AND t1.Device=t2.Device AND t1.PartNo=t2.PartNo AND t1.Time=t2.Time
            WHERE t1.PartNo='${part}'`;
            // t1.Device='${device}' AND
 
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});
 
router.get('/getdevice', (req, res) => {
    mysqlConnection(configFunc('product'))
        .then((connection) => {
            const sqlStr = 'SELECT DISTINCT Device FROM production_list';
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});
 
router.get('/getpartno/:device', (req, res) => {
    const { device } = req.params;
    mysqlConnection(configFunc('product'))
        .then((connection) => {
            const sqlStr = `SELECT DISTINCT PartNo FROM production_list WHERE Device='${device}' `;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});





router.post('/addinfo', (req, res) => {
 
    const postAry = req.body.data;
 
    const checkProcName=postAry.map((i)=>i.ProcName).filter((i)=>i==='').length;
    if(checkProcName>0){
        res.json({ message: '請確認資料格式 ', status: false });
        // (╬☉д⊙)
        return
    };
    // 如果有空的站點則res.json({ message: '請確認資料格式', status: false });
 
    mysqlConnection(configFunc('product'))
        .then((connection) => {
            let insertStr = postAry.map((i) => `('${i.ProcName}','${i.Device}','${i.PartNo}','${i.GoldenLine}','${i.Backup}','${i.Time}','${i.UID}')`).join(',');
 
            const sqlStr = `INSERT INTO production_list(ProcName, Device, PartNo, GoldenLine, Backup, Time, UID)
            VALUES ${insertStr}`;
            // ON DUPLICATE KEY UPDATE ProcName = VALUES(ProcName) , Device = VALUES(Device) , PartNo = VALUES(PartNo)
 
            return queryFunc(connection, sqlStr)
        })
        .then(() => {
            res.json({ message: '新增成功', status: true });
        })
        .catch((err) => {
            console.log(err);
            res.json({ message: '新增失敗', status: false });
        });
});
 
router.delete('/delinfo/:procname/:device/:partno', (req, res) => {
    const { procname, device, partno } = req.params;
 
    mysqlConnection(configFunc('product'))
        .then((connection) => {
            const sqlStr = `DELETE FROM production_list WHERE ProcName='${procname}' AND Device='${device}' AND PartNo='${partno}'`;
            return queryFunc(connection, sqlStr)
        })
        .then(() => {
            res.json({ message: '刪除成功', status: true });
        })
        .catch((err) => {
            console.log(err);
            res.json({ message: '刪除失敗', status: true });
        });
});
 
// router.get('/addproccode', (req, res) => {
//     mysqlConnection(configFunc('paoi'))
//         .then((connection) => {
//             const sqlStr = 'SELECT DISTINCT ProcNameS FROM aoi_trend_machine';
//             return queryFunc(sqlStr, connection)
//         })
//         .then((result) => {
//             res.json(result);
//         })
//         .catch((err) => {
//             console.log(err);
//         })
// });
 
router.get('/addmachine/:proccode', (req, res) => {
    const { proccode } = req.params;

    const sqlStr = `SELECT DISTINCT MachineName from PDL_Machine WHERE GTID='${proccode}'`
    poolAcme.query(sqlStr)
        .then((result) => {
            res.json(result.recordset);
        })
        .catch((err) => {
            console.log(err);
        })
});

 
router.get('/addpart',(req,res)=>{
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            
            const sqlStr = `SELECT DISTINCT CASE WHEN ProdClass ='EMIB' THEN 'EMIB' ELSE 'Non-EMIB' END ProdClass,PartNo FROM aoi_trend_rate WHERE LEFT(PartNo,4)<>'UMGL' ORDER BY PartNo `;
            return queryFunc(connection,sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/getcolabandom', (req, res) => {
    mysqlConnection(configFunc('product'))
        .then((connection) => {
            // 要如何排除已經刪除的device
            // 多個欄位紀錄 isdelete 1 or 0
            const sqlStr = `SELECT t1.device,t1.layer,t1.machine,t1.isabandom,t1.time,t1.uid FROM abandom_list t1
            INNER JOIN 
            (SELECT device,layer,machine,MAX(time)time FROM abandom_list GROUP BY device,layer,machine)t2
            ON t1.device=t2.device AND t1.layer=t2.layer AND t1.machine=t2.machine  AND t1.time=t2.time
            WHERE t1.isdelete='0'`;

            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.post('/ldlupdate', (req, res) => {

    const updateData = req.body;

    mysqlConnection(configFunc('product'))
        .then((connection) => {
            const updateStr = `${updateData.map((i) => `('${i.device.trim()}','${i.layer.trim()}','${i.machine.trim()}','${i.isabandom}','${i.time}','${i.uid}','${i.isdelete}')`)}`;

            const sqlStr = `INSERT INTO abandom_list(device,layer,machine,isabandom,time,uid,isdelete) VALUES ${updateStr}`;

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

router.post('/ldledit', (req, res) => {

    const { device, layer, machine, isabandom, time, uid, isdelete } = req.body

    mysqlConnection(configFunc('product'))
        .then((connection) => {
            const sqlStr = `INSERT INTO abandom_list (device, layer,machine, isabandom, time, uid, isdelete) 
            VALUES ('${device}','${layer}','${machine}','${isabandom}','${time}','${uid}','${isdelete}')`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json({ message: '修改完成', status: true });
        })
        .catch((err) => {
            res.json({ message: '修改失敗', status: false });
            console.log(err);
        })

});

router.post('/ldldelete/:device', (req, res) => {
    const { device } = req.params;
    mysqlConnection(configFunc('product'))
        .then((connection) => {
            const sqlStr = `UPDATE abandom_list SET isdelete='1' WHERE device='${device}'`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json({ message: '刪除完成', status: true });
        })
        .catch((err) => {
            res.json({ message: '刪除失敗', status: false });
            console.log(err);
        })
})

 
module.exports = router
 

 
 
 
