const express = require('express');
const soap = require('soap');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const {timestampToYMDHIS}=require('../time.js')

const router = express.Router();

router.use((req, res, next) => {
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With, Content-type,Accept,X-Access-Token,X-Key,Authorization');
    res.header('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

const key = 'YMYIP';
const whiteList = ['00776','05866','09068','A0274'];
router.use(bodyParser.json());
router.post('/login', (req, res) => {

    const url = 'http://10.13.66.33/WCF_MyumtAuth/Service1.svc?singleWsdl';

    const args = req.body;

    console.log('參數',args);

    new Promise((resolve, reject) => {
        soap.createClient(url, (err, client) => {
            if (err) {
                reject(err)
                console.log('拒絕')
            } else {
                resolve(client)
            }
        })
    })
        .then((client) => {
            // console.log('gjogjogjgojgojgojg', client)
            return new Promise((resolve, reject) => {
                client.Myumt_Auth(args, (err, result) => {
                    if (err) {
                        reject(err)
                        console.log('拒絕2')
                    } else {
                        resolve(result)
                    }
                })
            })
        })
        .then((result) => {
            // console.log('result',result);
            if (result['Myumt_AuthResult'].Status === false) {
                return res.json({ message: '用戶不存在或帳號密碼錯誤，請重新輸入' })
            }
            if (result['Myumt_AuthResult'].DeptName.includes('YM')=== false && whiteList.includes(result['Myumt_AuthResult'].id)===false) {
                return res.json({ message: '非YM或白名單用戶' })
            }
            const { id, name, DeptName } = result['Myumt_AuthResult'];
            const token = jwt.sign({ id, name, DeptName }, key);
            console.log({ message: '成功', token, userinfo: result['Myumt_AuthResult'] })
            res.json({ message: '成功', token, userinfo: result['Myumt_AuthResult'] });
        })
        .catch((err) => {
            console.log('錯誤')
            console.log(err);
        });
});

router.get('/verify', (req, res) => {
     
    const token = req.headers['authorization'];

    // 3-1驗證用戶headers.authorization裏頭有token
    if (!token) {
        res.send({ message: '未登入' });
    } else {
        // 3-2進行驗證
        jwt.verify(token, key, (err, user) => {//user參數為payload
            if (err) {
                return res.send({ message: '驗證錯誤' })
            }
            res.send({ message: '成功', user })
        })
    }
});

router.post('/record', (req, res) => {
    //{ID,Name,DeptName,Time,Path}
    const { ID, Name, DeptName, Time, Path } = req.body;

    mysqlConnection(configFunc('user'))
        .then((connection) => {
            const sqlStr = `INSERT INTO record(ID, Name, DeptName, Time, Path) 
            VALUES ('${ID}','${Name}','${DeptName}','${Time}','${Path}')`;
            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/record/:st', (req, res) => {
    const { st, et } = req.params;
    mysqlConnection(configFunc('user'))
        .then((connection) => {
            const transSt=timestampToYMDHIS(new Date(Number(st)));
            const sqlStr = `SELECT Count(*)Count FROM record 
        WHERE Path ='/login' AND Time >='${transSt}'`;
            return queryFunc(connection, sqlStr);
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
})

module.exports = router;
