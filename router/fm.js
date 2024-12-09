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
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/particle', (req, res) => {

    mysqlConnection(configFunc('fm'))
        .then((connection) => {
            const sqlStr = `SELECT * FROM particle_summary`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })

});

router.get('/class', (req, res) => {
   
    mysqlConnection(configFunc('fm'))
        .then((connection) => {
            const sqlStr = `SELECT * FROM class_table`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

module.exports = router
