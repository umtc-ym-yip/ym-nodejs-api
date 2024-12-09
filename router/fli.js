const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');
const fs = require('fs');
const { poolAcme, poolDc, poolNCN } = require('../mssql');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS, timestampToYMDHIS2 } = require('../time.js');
const { connect } = require('http2');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/alldata', (req, res) => {

    mysqlConnection(configFunc('fli'))
        .then((connection) => {

            const sqlStr = `SELECT * FROM fliyield`;

            return queryFunc(connection, sqlStr)

        })
        .then((result) => {
            res.json(result);
        })
        .catch(() => {
            res.json({ message: '抓取資料異常', status: false })
        })

});

router.get('/tagtri', (req, res) => {
    mysqlConnection(configFunc('tagtri'))
        .then((connection) => {

            const sqlStr = `SELECT * FROM fli_target_trigger`;

            return queryFunc(connection, sqlStr)

        })
        .then((result) => {
            res.json(result);
        })
        .catch(() => {
            res.json({ message: '抓取資料異常', status: false })
        })
})

router.get('/flistackyield/:pn', (req, res) => {
    const { pn } = req.params
    // console.log(timestampToYMDHIS3(parseFloat(st)) ,"   ",timestampToYMDHIS3(parseFloat(et)))
    mysqlConnection(configFunc('fli'))
        .then((connection) => {
            const sqlStr = `SELECT CONCAT(Year(Time),CASE WHEN LENGTH(Week(Time,6))=1 THEN CONCAT('0',Week(Time,6)) ELSE Week(Time,6) END )Week ,Time,PN,LotNum,LotType,Yield,A1,A7,A17,A18,A19,A21,A22,A71,J6,O10,S9,S10,S11,S12,S13,S14,S15,S11+S12+S13 as S11S12S13,A21+A22 as A21A22
            FROM fliyield WHERE 
            PN ='${pn}' AND LEFT(LotType,2) NOT IN ('E3')
        `;
        
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
            // res.json(err)
        })
});

router.get('/flistackpn/', (req, res) => {
    const { pn } = req.params

    // console.log(timestampToYMDHIS3(parseFloat(st)) ,"   ",timestampToYMDHIS3(parseFloat(et)))
    mysqlConnection(configFunc('fli'))
        .then((connection) => {
            const currentyear=new Date().getFullYear();
            const years=`'${currentyear}','${currentyear-1}'`
            const sqlStr = `SELECT DISTINCT PN FROM fli_stack WHERE left(Week,4) in (${years}) order by PN asc
        `;
        
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
            // res.json(err)
        })
});

router.get('/image', async (req, res) => {
    try {
        const { url, factory } = req.query;
        console.log('url',url,'factory' ,factory )
        if (!url||url.length<10) {
            return res.status(400).send('URL parameter is required');
        }

        // YM廠或非SFTP路徑的情況
        // if (factory === 'YM' || !url.includes('10.23.204.68')) {

            const imageBuffer = fs.readFileSync(`${url}`);
            return res.send(imageBuffer.toString('base64'));
        // }

        // SN廠或SFTP路徑的情況
        // if (factory === 'SN' || url.includes('10.23.204.68')) {
        //     try {
        //         const client = await sftpPool.acquire();
        //         try {
        //             const formattedPath = url
        //                 .replace(/^\\\\[\d\.]+/, '')
        //                 .replace(/\\/g, '/')
        //                 .replace(/^\/+/, '/');

        //             const buffer = await client.get(formattedPath, undefined, true);
        //             res.send(buffer.toString('base64'));
        //         } catch (err) {
        //             console.error('SFTP get error:', err);
        //             res.status(404).send('');
        //         } finally {
        //             await sftpPool.release(client);
        //         }
        //     } catch (err) {
        //         console.error('SFTP pool acquisition error:', err);
        //         res.status(500).send('');
        //     }
        // }
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).send('');
    }
});

module.exports = router
