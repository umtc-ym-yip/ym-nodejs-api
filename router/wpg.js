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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/fvi10/:st/:et', (req, res) => {
    mysqlConnection(configFunc('wpg'))
        .then((connection) => {
            const { st, et } = req.params
            const readoutsql = `
            SELECT DISTINCT ProdClass,PartNum,LotNum,LotType,totalCount,ChangeTime,Yield,Target,Triger,2DIDFail,2DMixedFail,3DFail,Remark 
            FROM wpgyieldfvi10 w LEFT JOIN wpg_target_triger t ON LEFT(w.PartNum,7)=t.ShortPart WHERE
            ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
            `;
            const devicesql = `SELECT DISTINCT ProdClass FROM wpgyieldfvi10 WHERE ProdClass<>'Client'`;
            const allsql = `SELECT DISTINCT * FROM wpgyieldfvi10 w LEFT JOIN wpg_target_triger t ON LEFT(w.PartNum,7)=t.ShortPart`
            return Promise.all([
                queryFunc(connection, readoutsql),
                queryFunc(connection, devicesql),
                queryFunc(connection, allsql),
            ])
        })
        .then((result) => {
            res.json({
                readout: result[0],
                device: result[1],
                trend: result[2]
            })
        })
        .catch((err) => {
            console.log(err)
        })
})

module.exports = router
