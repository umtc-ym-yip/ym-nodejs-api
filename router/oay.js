const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS } = require('../time.js')


const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/default', (req, res) => {
    mysqlConnection(configFunc('oay'))
        .then((connection) => {
            const sqldata = "SELECT * FROM default_table ORDER BY PartNum";
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});

const permissionList=['A1649','07045','A1477','A3478'];

router.post('/default/:partnum/:time/:uid', (req, res) => {
    const { partnum,time,uid } = req.params;

    if(!permissionList.includes(uid)){
        return res.json({message:'沒有權限，請向YIP申請權限'})
    }
    mysqlConnection(configFunc('oay'))
        .then((connection) => {
            const sqldata = `INSERT INTO default_table (PartNum,Time,UID) VALUES ('${partnum}','${time}','${uid}')`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json({message:'成功上傳至資料庫'})
        })
        .catch((err) => {
            console.log(err);
        });

});

router.delete('/default/:partnum/:uid', (req, res) => {
    const { partnum,uid } = req.params;

    if(!permissionList.includes(uid)){
        return res.json({message:'沒有權限，請向YIP申請權限'})
    }

    mysqlConnection(configFunc('oay'))
        .then((connection) => {
            const sqldata = `DELETE FROM default_table WHERE PartNum ='${partnum}'`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json({message:'成功將資料從資料庫刪除'})
        })
        .catch((err) => {
            console.log(err);
        });

});

router.get('/oaydata', (req, res) => {
    mysqlConnection(configFunc('oay'))
        .then((connection) => {
            const sqldata = `SELECT ProdClass,ChangeTime,lot_type,partnum,lotnum,
        In_Qnty,Out_Qnty,type,OST_Yield,OST_NG,OST_Check_in,OST_BD_Yield,OST_BD_NG,OST_BD_Check_in,CC_Yield,CC_NG,CC_Check_in,WPG_yield,WPG_NG,WPG_Check_in,
        VI_Yield,VI_NG,VI_Check_in,Bump_yield,Bump_NG,Bump_Check_in,Product_yield,Inline_NG,inline_yield,
        OAY_yield,Beg_Prc,End_Prc
        FROM oayyield WHERE LEFT(lot_type,2) NOT IN ('E3','R3') ORDER BY ChangeTime desc`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});

router.post('/remark', (req, res) => {

    const { lotnum,remark } = req.body;

    mysqlConnection(configFunc('oay'))
        .then((connection) => {
            const sqldata = `UPDATE oayyield SET Remark = '${remark}' WHERE lotnum = '${lotnum}'`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
})

router.get('/ncn/:lotnum', (req, res) => {

    const { lotnum } = req.params;

    mysqlConnection(configFunc('ncn'))
        .then((connection) => {

            const sqldata = `SELECT ncn_no,open_datetime,lot_no,SUBSTRING_INDEX(Failure_mode,'/',1)Failure_mode,Problem_des 
            FROM ncn WHERE lot_no ='${lotnum}'`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });
});

router.get('/reject/:lotnum', (req, res) => {

    const { lotnum } = req.params;

    mysqlConnection(configFunc('ncn'))
        .then((connection) => {

            const sqldata = `SELECT time,partno,lotno,lottype,eq_group,machine,result,sqnty,unit 
        FROM reject WHERE lotno = '${lotnum}'`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });

});

router.get('/divlot/:lotnum', (req, res) => {

    const { lotnum } = req.params;

    mysqlConnection(configFunc('ncn'))
        .then((connection) => {

            const sqldata = `SELECT BuildDate,Item,PartNum,LotNum,SUBSTRING(LayerName,2,length(LayerName))LayerName,IssLotNum,Notes,BefQnty,AftQnty,DivEmpId 
        FROM divlot WHERE LotNum ='${lotnum}'`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err);
        });

});

module.exports = router;
