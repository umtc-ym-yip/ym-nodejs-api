const express = require('express');
const mongodb = require('mongodb');
const sql = require('mssql');
const mysql = require('mysql2');
const { poolAcme } = require('../mssql.js')
const { configFunc } = require('../config.js')
const { mysqlConnection, queryFunc } = require('../mysql.js')
// const axios = require('axios');

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

router.get('/aoimask', (req, res) => {///async 

    let connect;
    let mongoData = [];
    let data = [];
    let data_update = [];
    mongodb.MongoClient.connect(mongoURI)
        .then(function (connection) {
            connect = connection;
            return connect
                .db('DatamationYM_IBDI')
                .collection('YM_Core_Bu_VRS_MaskPointTable_master')
                .find({ "Mask_True_Group": { $gte: 0 } })
                .toArray();
        })
        .then((data) => {
            mongoData = data;
            return poolAcme.query(`select  Rtrim(lotnum)Lot, a.layer, Rtrim(c.LayerName)LayerName,e.MachineName,convert(varchar, ChangeTime, 120) ChangeTime from pdl_ckhistory a(nolock) 
                         inner join numoflayer c(nolock) on a.layer = c.Layer
                         inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
                         where proccode='LTH23' and BefStatus='MoveIn' and AftStatus='CheckIn' and AftTimes='1'`)
        })
        .then((result) => {
            result.recordset.forEach((i) => {
                const matchIndex = mongoData.findIndex((o) => i.Lot === o.Lot && i.LayerName === '-' + o.ACME_Layer);
                if (matchIndex === -1) {///沒固定點的資料
                    i.Status = '0';
                } else {///反之
                    const lotLoc = mongoData[matchIndex];

                    i.layer = String(i.layer);
                    i.Lot_Layer = lotLoc.Lot_Layer;
                    i.Part_No = lotLoc.Part_No;
                    i.ChangeTime = String(i.ChangeTime).substring(0, 10) + ' ' + String(i.ChangeTime).substring(11, 19);
                    i.Mask_False_Group = String(lotLoc.Mask_False_Group);
                    i.Mask_Total_Group = String(lotLoc.Mask_Total_Group);
                    i.Mask_True_Group = String(lotLoc.Mask_True_Group);
                    i.Product = lotLoc.Product;
                    i.Side = lotLoc.Side;
                    i.Status = '1';
                    // console.log(i);  
                }
            }
            )
            return result.recordset.filter((i) => i.Status === '1')
        })
        .then((data_all) => {
            data = data_all;
            return mysqlConnection(configFunc('aoi_mask'))
        })
        .then((connection) => {
            const sql_mask = "Select Lot, LayerName from aoi_mask_point";
            return queryFunc(connection, sql_mask);
        })
        .then((mask) => {
            data.forEach((i) => {
                const matchIndex = mask.findIndex((o) => i.Lot === o.Lot && i.LayerName === o.LayerName);
                if (matchIndex === -1) {
                    i.maskStatus = '1';
                } else {
                    i.maskStatus = '0';
                }
            })
            data_update = data.filter((i) => i.maskStatus === '1');

            data_update.length>1?data_update.forEach((i) => delete i.maskStatus):true;
            // console.log(data_update);
            res.json({
                fixedreadout: { data: data_update, db: 'aoi_mask', table: 'aoi_mask_point' }
            });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ error: 'An error occurred' });
        })
        .finally(() => {
            connect.close();
        })
});

router.get('/aoipanel', (req, res) => {///async 

    let connect;
    let mongoData = [];
    let data=[];
    let data_update2 =[];
    mongodb.MongoClient.connect(mongoURI)
        .then(function (connection) {
            connect = connection;
            return connect
                .db('DatamationYM_IBDI')
                .collection('YM_Core_Bu_VRS_PanelPointTable_master')
                .find({ "Panel_True_Group": { $gte: 0 } })
                .toArray();
        })
        .then((data) => {
            mongoData = data;
            return poolAcme.query(`select  Rtrim(lotnum)Lot, a.layer, Rtrim(c.LayerName)LayerName,e.MachineName,convert(varchar, ChangeTime, 120) ChangeTime from pdl_ckhistory a(nolock) 
                         inner join numoflayer c(nolock) on a.layer = c.Layer
                         inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
                         where proccode='LTH23' and BefStatus='MoveIn' and AftStatus='CheckIn' and AftTimes='1'`)
        })
        .then((result) => {
            
            result.recordset.forEach((i) => {
                const matchIndex = mongoData.findIndex((o) => i.Lot === o.Lot && i.LayerName === '-' + o.ACME_Layer);
                if (matchIndex === -1) {///沒固定點的資料
                    i.Status = '0';
                } else {///反之
                    const lotLoc = mongoData[matchIndex];
                    
                    i.Lot_Layer = lotLoc.Lot_Layer;
                    i.Part_No = lotLoc.Part_No;
                    i.ChangeTime = String(i.ChangeTime).substring(0, 10) + ' ' + String(i.ChangeTime).substring(11, 19);
                    i.Panel_False_Group = String(lotLoc.Panel_False_Group);
                    i.Panel_Total_Group = String(lotLoc.Panel_Total_Group);
                    i.Panel_True_Group = String(lotLoc.Panel_True_Group);
                    i.Product = lotLoc.Product;
                    i.Side = lotLoc.Side;
                    i.Status = '1';
                    // console.log(i);  
                }
            }
            )
            return result.recordset.filter((i) => i.Status === '1')
        })
        .then((data_all) => {
            data=data_all;
            return mysqlConnection(configFunc('aoi_panel'))
        })
        .then((connection)=>{
            const sql_mask  = "Select Lot, LayerName from aoi_panel_point";
            return queryFunc(connection,sql_mask);
        })
        .then((mask)=>{
            data.forEach((i) => {
                const matchIndex = mask.findIndex((o) => i.Lot === o.Lot && i.LayerName === o.LayerName);
                if (matchIndex === -1) {
                    i.maskStatus = '1';
                } else {
                    i.maskStatus = '0';
                }
            })
            data_update2= data.filter((i) => i.maskStatus === '1');
            data_update2.length>1?data_update2.forEach((i) => delete i.maskStatus):true;
            res.json({
                fixedreadout: { data: data_update2, db: 'aoi_panel', table: 'aoi_panel_point' }
            });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ error: 'An error occurred' });
        })
        .finally(() => {
            connect.close();
        })
});


module.exports = router
