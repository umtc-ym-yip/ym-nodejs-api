const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const { timestampToYMDHIS } = require('../time.js');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.header('Origin'));
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.use(cors());
router.use(bodyParser.json());

router.get('/note', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sql = 'SELECT * FROM aoi_note_mask';
            const p=queryFunc(connection, sql);
            connection.end();
            return p
        })
        .then((results) => {
            res.json(results);
        })
        .catch((err) => {
            res.json(err);
        })
});

router.post('/note', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sql = 'INSERT INTO aoi_note_mask (`Product`,`Lot_Layer`,`PartNo`, `LotNum`, `Layer`, `Side`, `Mask_False_Group`, `Mask_True_Group`, `Mask_Total_Group`, `Machine`, `CheckIn`) VALUES ?';
            const data = req.body.map((i) => [i.Product,i.Lot_Layer,i.Part_No, i.Lot, i.LayerName, i.Side, i.Mask_False_Group, i.Mask_True_Group, i.Mask_Total_Group, i.MachineName, i.ChangeTime]);
            const p=queryFunc(connection, sql, [data]);
            connection.end();
            return p
        })
        .then((results) => {
            res.json({ msg: 'success' });
            console.log(results);
        })
        .catch((err) => {
            res.json({ msg: 'fail' });
            console.log(err);
        })
});

router.delete('/note/:lot/:layer',(req,res)=>{
    const {lot,layer}=req.params;
    mysqlConnection(configFunc('paoi'))
        .then((connection)=>{
            const sql='DELETE FROM aoi_note_mask WHERE LotNum=? AND Layer=?';
            const p=queryFunc(connection, sql, [lot,layer]);
            connection.end();
            return p
        })
        .then((results)=>{
            res.json({msg:'success'});
            console.log(results)
        })
        .catch((err)=>{
            res.json({msg:'fail'});
            console.log(err)
        })
});

router.get('/deal', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sql = 'SELECT * FROM aoi_deal_mask';
            const p = queryFunc(connection, sql);
            connection.end();
            return p
        })
        .then((results) => {
            res.json(results);
        })
        .catch((err) => {
            res.json(err);
        })
});

router.post('/deal/:lot/:layer/:side/:ds/:dt/:wt/:uid', (req, res) => {///上傳
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const { lot, layer, side, ds, dt, wt, uid } = req.params;

            const sql = `INSERT INTO aoi_deal_mask (LotNum, Layer, Side, DealStatus, DealTime, WriteTime, UID) VALUES 
        ('${lot}','${layer}','${side}','${ds}','${timestampToYMDHIS(Number(dt))}','${timestampToYMDHIS(Number(wt))}','${uid}')`;
        console.log(sql);
            const p = queryFunc(connection, sql);
            connection.end();
            return p
        })
        .then((results) => {
            res.json({ msg: 'success' });
            console.log(results);
        })
        .catch((err) => {
            res.json({ msg: 'fail' });
            console.log(err);
        })
});

router.put('/deal/:lot/:layer/:side/:ds/:dt/:wt/:uid', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const { lot, layer, side, ds, dt, wt, uid } = req.params;

            const sql = `UPDATE aoi_deal_mask SET DealStatus='${ds}',DealTime='${timestampToYMDHIS(Number(dt))}',WriteTime='${timestampToYMDHIS(Number(wt))}',UID='${uid}' 
        WHERE LotNum='${lot}' AND Layer='${layer}' AND Side='${side}'`;

            const p = queryFunc(connection, sql);
            connection.end();
            return p
        })
        .then((results) => {
            res.json({ msg: 'success' });
            console.log(results);
        })
        .catch((err) => {
            res.json({ msg: 'fail' });
            console.log(err);
        })
});

router.delete('/deal/:lot/:layer/:side/',(req,res)=>{
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const { lot, layer, side } = req.params;

            const sql=`DELETE FROM aoi_deal_mask 
            WHERE LotNum='${lot}' AND Layer='${layer}' AND Side='${side}'  `

            const p = queryFunc(connection, sql);
            connection.end();
            return p
        })
        .then((results) => {
            res.json({ msg: 'success' });
            console.log(results);
        })
        .catch((err) => {
            res.json({ msg: 'fail' });
            console.log(err);
        })
});


router.get('/maskdata', (req, res) => {

    mysqlConnection(configFunc('aoi_mask'))
        .then((connection) => {

            const sqlStr = `SELECT * FROM aoi_mask_point`;

            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        });
});


module.exports = router;






