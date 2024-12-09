const express = require('express');
const mongodb = require('mongodb');
const sql = require('mssql');
const mysql=require('mysql2');
const { poolAcme } = require('../mssql.js')
const { poolEdc } = require('../mssql.js');
const { configFunc } = require('../config.js')
const { mysqlConnection,queryFunc } = require('../mysql.js')
// const spacetime = require('spacetime');
// const axios = require('axios');
function parseToJSON(inputString) {
    // 首先检查输入是否为 undefined 或 null
    if (inputString === undefined || inputString === null) {
      return "Error: Input is undefined or null";
    }
  
    // 确保输入是一个字符串
    if (typeof inputString !== 'string') {
      return `Error: Input is not a string, it is a ${typeof inputString}`;
    }
  
    try {
      // 移除开头和结尾的引号，以及可能存在的转义字符
      let trimmedString = inputString.replace(/^"|"$/g, '').replace(/\\"/g, '"');
      
      // 尝试解析 JSON 字符串
      const jsonObject = JSON.parse(trimmedString);
      
      // 返回格式化的 JSON 字符串
      return JSON.stringify(jsonObject, null, 2);
    } catch (error) {
      console.error("Initial parsing failed, attempting to clean the string");
      try {
        // 如果初始解析失败，尝试清理字符串
        let cleanedString = inputString
          .replace(/\\n/g, "\\n")  
          .replace(/\\'/g, "\\'")
          .replace(/\\"/g, '\\"')
          .replace(/\\&/g, "\\&")
          .replace(/\\r/g, "\\r")
          .replace(/\\t/g, "\\t")
          .replace(/\\b/g, "\\b")
          .replace(/\\f/g, "\\f")
          .replace(/[\u0000-\u0019]+/g, ""); // 移除所有控制字符
        
        // 再次尝试解析
        const jsonObject = JSON.parse(cleanedString);
        return JSON.stringify(jsonObject, null, 2);
      } catch (secondError) {
        return `Error parsing JSON: ${secondError.message}\n\nOriginal string: ${inputString.substring(0, 100)}...`;
      }
    }
  }


const router = express.Router();
// mongo
const mongoURI = "mongodb://datamationYM:P%40ssw0rd@utcymmgs01.unimicron.com:27017/?authSource=DatamationYM_AIOT";
// const client = new mongodb.MongoClient(mongoURI);


router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});






router.get('/CCEIS', (req, res) => {
    let connect;
    let mongoData = [];
    let mongoFinal = [];
    const curDate = new Date(new Date(new Date().getTime() - 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0))
    const curDate1 = new Date(new Date(new Date().getTime() - 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0))
    // curDate.setHours(0);
    // curDate1.setHours(0);
    // let date_td = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    console.log(curDate)
    curDate1.setDate(curDate1.getDate()-2);
    console.log(curDate1)
    // let date_yd = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    
    mongodb.MongoClient.connect(mongoURI)       
    .then(function (connection) {
            connect = connection;
            return  Promise.all([
                connect
                .db('DatamationYM_AIOT')
                .collection('HD')
                .aggregate([
                    { $match: {
                        EQNo: { $in: ['SYM0127'] },
                        Addres: { $in: ['114'] },
                        Value: { $regex: '469E0010800', $options: 'i' }  // 這裡使用正則表達式
                      }},
{ $sort: {Inserttime: -1}},
{ $limit: 20 },
// { $addFields: { Date: {$add: [{$toLong : "$Inserttime"}, 28800000] }}},
// { $match: {"Inserttime" : { $gt: curDate1, $lte:curDate}}},
// { $addFields: { Date: {$add: [{$toLong : "$Inserttime"}, 28800000] }}},
// { $group: {_id: {Date: "$Date", EQNo: "$EQNo"}, temp: { $push: "$Value"  }, Count: {$sum:1}}},
// { $match: {"Count" : { $eq:3}}},
// { $addFields: { "Stage": {$max: "$temp"}}},
// { $addFields: { "Lot": {$min: "$temp"}}},
// { $addFields: { "Prg": {$min: {$maxN: {input:"$temp",n:2}}}}},
// { $group: {_id: {temp:["$Stage","$Lot","$Prg"]}, Date: {$min: "$_id.Date"}, EQNo: {$first: "$_id.EQNo"}}},
                 ])
                .toArray(),
                // poolAcme.query(`select  Rtrim(lotnum)Lot, a.layer, Rtrim(c.LayerName)LayerName,e.MachineName, AftStatus , convert(varchar, ChangeTime, 120) ChangeTime from pdl_ckhistory a(nolock) 
                // inner join numoflayer c(nolock) on a.layer = c.Layer
                // inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
                // where proccode='LTH39' and AftStatus in ('CheckIn', 'CheckOut') and AftTimes='1'`)
                ])
        })
        .then((data) => {
            console.log(data[0].length)
            data[0].forEach((item,index,array)=>{
                // console.log(item.Value)
                // aaa
                let batchdata=JSON.parse(data[0][index].Value);
                item.BoardID=batchdata.BoardID
                item.Line=batchdata.Line
                item.Consumptions=batchdata.Consumptions
                item.Locations=batchdata.Locations
                item.Station=batchdata.Station
                item.Lane=batchdata.Lane
                delete item.Value
            })
             console.log('111')
            //
            res.json(data[0]);
            // res.json(data[0]);
            // res.json(JSON.parse(data[0][1].Value))
            
        })
        .catch((err) => {
            console.log(err)
        });
    
    
})
router.get('/bumpinlineyield/:start/:hour', async (req, res) => {
    try {
        const start = req.params.start
        const hour=req.params.hour
        //顯示現在時間，並轉換為台灣時間
        const now = new Date();
        console.log(now.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }));
        const curDate = new Date(new Date(new Date().getTime() - 24 * 60 * 60 * 1000).setHours(hour, 0, 0, 0));
        const curDate1 = new Date(new Date(new Date().getTime() - 24 * 60 * 60 * 1000).setHours(hour-12, 0, 0, 0));
        curDate.setDate(curDate.getDate() - start);
        curDate1.setDate(curDate1.getDate() - start);
        console.log(curDate);
        console.log(curDate1);

        const client = await mongodb.MongoClient.connect(mongoURI);
        const db = client.db('DatamationYM_AIOT');
        const collection = db.collection('HD');
        
        let mongoData = await collection.aggregate([
            { 
                $match: { 
                    "EQNo": { $in: ['SYM0120','SYM0310','SYM0495','SYM0699','SYM0701'] },
                    "Inserttime": { $gte: curDate1, $lt: curDate },  // 添加時間篩選條件
                    "Addres": { $in: ["IR_Unit_Yield_After","IR_Unit_Yield_Before","MPID","Ball stencil","Flux stencil","IR_Extra_After","IR_Extra_Before","IR_Extra_Unit_After","IR_Extra_Unit_Before","IR_Large_After","IR_Large_Before","IR_Large_Unit_After","IR_Large_Unit_Before","IR_NoBall_After","IR_NoBall_Before","IR_NoBall_Unit_After","IR_NoBall_Unit_Before","IR_Shift_After","IR_Shift_Before","IR_Shift_Unit_After","IR_Shift_Unit_Before"] }
                } 
            },
            { $limit: 1200000 },
        ]).toArray()
        // res.json(mongoData)
        mongoData=mongoData.sort((a,b)=>a.Inserttime.getTime()-b.Inserttime.getTime())
        //顯示現在時間
        const now2 = new Date();
        console.log(now2.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }));
        // res.json(mongoData)
        const machineArray=[{EQNo:'SYM0120',Machine:'Y1 uBall_001'},{EQNo:'SYM0310',Machine:'Y1 uBall_002'},{EQNo:'SYM0495',Machine:'Y1 uBall_003'},{EQNo:'SYM0699',Machine:'Y1 uBall_004'},{EQNo:'SYM0701',Machine:'Y1 uBall_005'}]
        mongoData.forEach(item => {
            item.MPID=mongoData.find(i=>i.EQNo===item.EQNo&&i.Addres==='MPID'&&i.Inserttime.getTime()===item.Inserttime.getTime())?.Value
            item.EQNo=machineArray.find(i=>i.EQNo===item.EQNo)?.Machine

        });
        mongoData.forEach(item => {
            item.Ball_stencil=mongoData.filter(i=>i.EQNo===item.EQNo&&i.Addres==='Ball stencil'&&i.Inserttime.getTime()<=item.Inserttime.getTime()).sort((a,b)=>a.Inserttime.getTime()-b.Inserttime.getTime()).at(-1)?.Value
            item.Flux_stencil=mongoData.filter(i=>i.EQNo===item.EQNo&&i.Addres==='Flux stencil'&&i.Inserttime.getTime()<=item.Inserttime.getTime()).sort((a,b)=>a.Inserttime.getTime()-b.Inserttime.getTime()).at(-1)?.Value
            item.IR_Unit_Yield_After=mongoData.find(i=>i.EQNo===item.EQNo&&i.Addres==='IR_Unit_Yield_After'&&i.MPID===item.MPID&&i.Inserttime.getTime()===item.Inserttime.getTime())?.Value
            item.IR_Unit_Yield_Before=mongoData.find(i=>i.EQNo===item.EQNo&&i.Addres==='IR_Unit_Yield_Before'&&i.MPID===item.MPID&&i.Inserttime.getTime()===item.Inserttime.getTime())?.Value
            item.IR_Extra_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Extra_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Extra_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Extra_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Extra_Unit_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Extra_Unit_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Extra_Unit_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Extra_Unit_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Large_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Large_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Large_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Large_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Large_Unit_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Large_Unit_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Large_Unit_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Large_Unit_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_NoBall_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_NoBall_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_NoBall_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_NoBall_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_NoBall_Unit_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_NoBall_Unit_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_NoBall_Unit_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_NoBall_Unit_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Shift_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Shift_After' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Shift_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Shift_Before' && i.MPID === item.MPID && i.Inserttime.getTime() === item.Inserttime.getTime())?.Value;
            item.IR_Shift_Unit_After = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Shift_Unit_After' && i.MPID === item.MPID)?.Value;
            item.IR_Shift_Unit_Before = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'IR_Shift_Unit_Before' && i.MPID === item.MPID)?.Value;
            // item.FP_Table_Vacuum_PV = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'FP_Table_Vacuum_PV' && i.MPID === item.MPID)?.Value;
            // item.BP_Table_Vacuum_PV = mongoData.find(i => i.EQNo === item.EQNo && i.Addres === 'BP_Table_Vacuum_PV' && i.MPID === item.MPID)?.Value;
            
        });
        mongoData=mongoData.filter(i=>i.Ball_stencil!==undefined&&i.Flux_stencil!==undefined&&i.IR_Unit_Yield_After!==undefined&&i.IR_Unit_Yield_Before!==undefined&&i.Addres==='MPID')
        mongoData.forEach(item => {
            //將Inserttime轉換為日期格式，並轉換為台灣時間，丟到MYSQL中的時間格式會出錯

            item.Inserttime = new Date(item.Inserttime)
            item.Inserttime.setHours(item.Inserttime.getHours()+8)
            item.Inserttime = item.Inserttime.toISOString().slice(0, 19).replace('T', ' ')
            delete item._id
            delete item.Prodarea
            delete item.Addres
            delete item.ItemType
            delete item.Value
            delete item.LotNo
            // delete item.EQNo
        });
        //顯示現在時間，並轉換為台灣時間
        const now1 = new Date();
        console.log(now1.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }));
        res.json({
            bumpinlineyield: { data: mongoData, db: 'bumpaoi', table: 'bumpinlineyield', match: ["Ball_stencil","Flux_stencil","IR_Unit_Yield_After","IR_Unit_Yield_Before","IR_Extra_After","IR_Extra_Before","IR_Extra_Unit_After","IR_Extra_Unit_Before","IR_Large_After","IR_Large_Before","IR_Large_Unit_After","IR_Large_Unit_Before","IR_NoBall_After","IR_NoBall_Before","IR_NoBall_Unit_After","IR_NoBall_Unit_Before","IR_Shift_After","IR_Shift_Before","IR_Shift_Unit_After","IR_Shift_Unit_Before"] },
        })
        console.log('111')
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: '發生內部伺服器錯誤' });
    }
});


router.get('/ldlstage', (req, res) => {
    let connect;
    let mongoData = [];
    let mongoFinal = [];
    const curDate = new Date(new Date(new Date().getTime() - 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0))
    const curDate1 = new Date(new Date(new Date().getTime() - 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0))
    // curDate.setHours(0);
    // curDate1.setHours(0);
    // let date_td = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-5);
    console.log(curDate)
    curDate1.setDate(curDate1.getDate()-6);
    console.log(curDate1)
    // let date_yd = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    
    mongodb.MongoClient.connect(mongoURI)       
    .then(function (connection) {
            connect = connection;
            return  Promise.all([
                connect
                .db('DatamationYM_AIOT')
                .collection('HD')
                .aggregate([
// SYM0068 SYM0069 SYM0070 SYM0071 SYM0072 SYM0073 SYM0074 SYM0075 SYM0076 SYM0312
// SYM0313 SYM0314 SYM0342 SYM0316 SYM0315
// SYM0503 SYM0504 SYM0505 SYM0506 SYM0507 SYM0508 SYM0509 SYM0510 SYM0511 SYM0512
// SYM0513 SYM0514 SYM0515 SYM0516 SYM0517
// SYM0598 SYM0599 SYM0600 SYM0601 SYM0602 SYM0603 SYM0604 SYM0605 SYM0606 SYM0607
// SYM0608
// SYM0609 SYM0610 SYM0611 (44台[0:43])
{ $match: {"EQNo" : { $in: ['SYM0068','SYM0069','SYM0070','SYM0071','SYM0072','SYM0073','SYM0074','SYM0075','SYM0076','SYM0312','SYM0313','SYM0314','SYM0342','SYM0316','SYM0315','SYM0503','SYM0504','SYM0505','SYM0506','SYM0507','SYM0508','SYM0509','SYM0510','SYM0511','SYM0512','SYM0513','SYM0514','SYM0515','SYM0516','SYM0517','SYM0598','SYM0599','SYM0600','SYM0601','SYM0602','SYM0603','SYM0604','SYM0605','SYM0606','SYM0607','SYM0608','SYM0609','SYM0610','SYM0611']}, "Addres": { $in: ['5', '10','14']} }},
{ $sort: {Inserttime: -1}},
{ $limit: 4000000 },
// { $addFields: { Date: {$add: [{$toLong : "$Inserttime"}, 28800000] }}},
{ $match: {"Inserttime" : { $gt: curDate1, $lte:curDate}}},
{ $addFields: { Date: {$add: [{$toLong : "$Inserttime"}, 28800000] }}},
{ $group: {_id: {Date: "$Date", EQNo: "$EQNo"}, temp: { $push: "$Value"  }, Count: {$sum:1}}},
{ $match: {"Count" : { $eq:3}}},
{ $addFields: { "Stage": {$max: "$temp"}}},
{ $addFields: { "Lot": {$min: "$temp"}}},
{ $addFields: { "Prg": {$min: {$maxN: {input:"$temp",n:2}}}}},
{ $group: {_id: {temp:["$Stage","$Lot","$Prg"]}, Date: {$min: "$_id.Date"}, EQNo: {$first: "$_id.EQNo"}}},
                ])
                .toArray(),
                // poolAcme.query(`select  Rtrim(lotnum)Lot, a.layer, Rtrim(c.LayerName)LayerName,e.MachineName, AftStatus , convert(varchar, ChangeTime, 120) ChangeTime from pdl_ckhistory a(nolock) 
                // inner join numoflayer c(nolock) on a.layer = c.Layer
                // inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
                // where proccode='LTH39' and AftStatus in ('CheckIn', 'CheckOut') and AftTimes='1'`)
                ])
        })
        .then((data) => {
            res.json(data);
            // res.json(data)
            mongoData = data[0];
            mongoData.forEach((i)=> {
                i.Date = new Date(i.Date);
                i.EQNo = i.EQNo;
                i._id.temp.forEach((j) => {
                    if(j.length > 30){
                        i.prg = j.split('\\')[3]
                    }else if(j.length > 10){
                        i.lot = j.substring(0,8) + '-' + j.substring(8,10) + '-' + j.substring(10,12);
                        i.board = j.substring(14,16)
                    }else{
                        i.stage = j
                    };
                })
                delete i.temp;
                delete i._id;
            });
        })
        .then((result) => {
            mongoData.forEach((i)=> {
                if(i.lot !== undefined && i.board !== undefined && i.stage !== undefined && i.prg !== undefined){
                    i.match = '1'
                }else{
                    i.match = '0'
                }
            });
            mongoFinal= mongoData.filter((i) => i.match === '1');
            mongoFinal.length>1?mongoFinal.forEach((i) => delete i.match):true;
            res.json({
                fixedreadout: { data: mongoFinal, db: 'eis', table: 'ldl_stage' }
            });
        })
        .catch((err) => {
            console.log(err)
        });
    
    
})

router.get('/EisEventAutoMylarPeeler', (req, res) => {
    let connect;
    let mongoData = [];
    let mongoFinal = [];
    let pdl_ckhistory = [];
    let pdl_ckhistory_in = [];
    let pdl_ckhistory_out = [];
    let data = [];
    let data_0 = [];

    mongodb.MongoClient.connect(mongoURI)
        .then(function (connection) {
            connect = connection;
            return Promise.all([
                connect
                    .db('DatamationYM_AIOT')
                    .collection('EventHD')
                    .aggregate([
                        //{ $match: {"EQNo" : { $in: ['SYM0044']}, "Addres": { $in: ['5', '10','14']} }},
                        { $match: { "EQNo": { $in: ['SYM0044', 'SYM0438', 'SYM0635'] }, "AlarmCode": { $in: ['E6038 P=257', 'E6039 P=1', 'E6040 P=256', 'E6058 P=1000', 'E6059 P=1000', 'E6060 P=1000', 'E6061 P=1000', 'E6062 P=1000', 'E6063 P=1000'] } } },
                        { $sort: { "OccurTime": -1 } },
                        //{ $limit: 1000 },
                        { $addFields: { Date: { $add: [{ $toLong: "$OccurTime" }, 28800000] } } },
                        { $match: { "Date": { $gt: new Date("2024-01-01").getTime() } } },
                    ])
                    .toArray(),
                poolAcme.query(`select  Rtrim(lotnum)Lot, a.layer, Rtrim(c.LayerName)LayerName,e.MachineName, AftStatus , convert(varchar, ChangeTime, 120) ChangeTime from pdl_ckhistory a(nolock) 
                inner join numoflayer c(nolock) on a.layer = c.Layer
                inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
                where proccode='LTH17' and AftStatus in ('CheckIn', 'CheckOut') and AftTimes='1' and ChangeTime > '2024-01-01'`)
            ])
        })
        .then((data) => {
            mongoData = data[0];
            pdl_ckhistory = data[1];
            mongoData.forEach((i) => {
                i.Datetime = new Date(i.Date);
                if (i.EQNo === 'SYM0044') {
                    i.Machine = 'Y1 增層線路顯影_001'
                } else if (i.EQNo === 'SYM0438') {
                    i.Machine = 'Y1 增層線路顯影_002'
                } else {
                    i.Machine = 'Y1 增層線路顯影_003'
                };
                if (i.AlarmCode === 'E6038 P=257' | i.AlarmCode === 'E6039 P=1' | i.AlarmCode === 'E6040 P=256') {
                    i.Alarm = '剔退'
                } else {
                    i.Alarm = '卡膜'
                };
                delete i._id;
                delete i.Prodarea;
                delete i.Status;
                delete i.User;
                delete i.OccurTime;
                delete i.Date;
            });
        })
        .then((data) => {
            pdl_ckhistory['recordset'].forEach((j) => {
                if (j.AftStatus === "CheckIn") {
                    pdl_ckhistory_in.push(j)
                } else {
                    pdl_ckhistory_out.push(j)
                }
            })
        })
        .then((conbine) => {
            for (i = 0; i < pdl_ckhistory_out.length; i++) {
                for (j = 0; j < pdl_ckhistory_in.length; j++) {
                    if (pdl_ckhistory_out[i].Lot === pdl_ckhistory_in[j].Lot & pdl_ckhistory_out[i].LayerName === pdl_ckhistory_in[j].LayerName & pdl_ckhistory_out[i].MachineName === pdl_ckhistory_in[j].MachineName) {
                        data.push([pdl_ckhistory_out[i].Lot, pdl_ckhistory_out[i].LayerName, pdl_ckhistory_out[i].MachineName, pdl_ckhistory_in[j].ChangeTime, pdl_ckhistory_out[i].ChangeTime]);
                        break;
                    }
                }
            };
        })
        .then((conbine) => {
            mongoData.forEach((i) => { i.Lot = '';i.Layer = '';i.CheckIn = '';i.CheckOut = ''; });
            for (i = 0; i < mongoData.length; i++) {
                for (j = 0; j < data.length; j++) {
                    if (mongoData[i].Machine === data[j][2] & mongoData[i].Datetime.getTime() - 28800000 >= new Date(data[j][3]) & mongoData[i].Datetime.getTime() - 28800000 <= new Date(data[j][4])) {
                        mongoData[i].Lot = data[j][0];
                        mongoData[i].Layer = data[j][1];
                        mongoData[i].CheckIn = data[j][3];
                        mongoData[i].CheckOut = data[j][4];
                        break;
                    }
                }
            };
            return mysqlConnection(configFunc('eis'));
        })
        .then((connection) => {
            const sql = "Select * from dfv_event";
            return queryFunc(connection, sql);
        })
        .then((sql_data) => {
            data_0 = sql_data;
            mongoData.forEach((i) => { i.match = '0' });
            if (data_0.length > 0) {
                for (let i = 0; i < mongoData.length; i++) {
                    for (let j = 0; j < data_0.length; j++) {
                        if (mongoData[i].EQNo === data_0[j].EQNo
                            && String(mongoData[i].Datetime) === String(new Date(data_0[j].Datetime))
                            // && mongoData[i].Lot+mongoData[i].Layer === data_0[j].Lot+ data_0[j].Layer
                            // && mongoData[i].Layer === data_0[j].Layer
                        ) { 
                            mongoData[i].match = '1';
                        }
                    }
                }
            }
        })
        .then((result) => {
            mongoData.forEach((i)=> {
                if(i.Lot.length > 1 && i.Layer.length > 1 && i.match==="0"){
                    i.Final='1'
                }else{
                    i.Final='0'
                }
                mongoFinal= mongoData.filter((i) => i.Final === '1');
                
                
            });
        })
        .then(()=>{
            mongoFinal.length>1?mongoFinal.forEach((i) => delete i.match ):true;
            mongoFinal.length>1?mongoFinal.forEach((i) => delete i.Final ):true;
            res.json({
                    fixedreadout: { data: mongoFinal, db: 'eis', table: 'dfv_event' }
                });
        })
        .catch((err) => {
            console.log(err)
        });

})

router.get('/Particle_Week', (req, res) => {
    let connect;
    let mongoData = [];
    let EDC_ = [];
    
    const curDate = new Date()
    curDate.setHours(8, 0, 0, 0);
    curDate.setDate(curDate.getDate()-2);
    date_7 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    date_6 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    date_5 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    date_4 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    date_3 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    date_2 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');
    curDate.setDate(curDate.getDate()-1);
    date_1 = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');

    if(Math.floor((((curDate/86400000)-19722)/7 + 1 )).toString().length === 1){
        Week = '24W0' + Math.floor((((curDate/86400000)-19722)/7 + 1 )).toString()
    }else{
        Week =  '24W' + Math.floor((((curDate/86400000)-19722)/7 + 1 )).toString()
    }

    Promise.all([poolEdc.query(`select 小機編號 from [dbo].[Para_Modbus] a(nolock) where VID in ('030910') `)])
    .then((edc) => {
        EDC_ = edc[0].recordset;
        return mongodb.MongoClient.connect(mongoURI)        
    })
    .then(function (connection) {
            connect = connection;
            
            return  Promise.all([
                //'030910','031112','031314','031516'
                connect
                .db('DatamationYM_AIOT')
                .collection('HD')
                .aggregate([
                            { $match: { "Addres": { $in: ['030910','031112','031314','031516']}}},
                            { $sort: {Inserttime: -1}},
                            { $limit: 2500000},
                            { $addFields: { Date: {$dateToString: { format: '%Y-%m-%d', date : {$toDate: {$add: [{$toLong : "$Inserttime"}, 28800000] }}}}}},
                            { $match: { "Date": { $in: [date_1,date_2,date_3,date_4,date_5,date_6,date_7]}}},
                            { $group: { _id: { EQNo: "$EQNo",  Addres: "$Addres", }, avg: {$avg: {$toInt: "$Value"}}, std: {$stdDevPop: {$toInt: "$Value"}}}},
                        ])
                .toArray()   
                ,
                poolEdc.query(`select * from [dbo].[Para_Modbus] a(nolock)`)
                ])
        })
        .then((result) => {
            //console.log(result[0]);
            
            result[0].forEach((i)=>{
                // i.Date = new Date(i.Inserttime).toLocaleDateString();
                // i.Date = i._id.Date;
                i.Week = Week;
                i.EQNo = i._id.EQNo;
                const idy=result[1].recordset.findIndex(d=>d.小機編號===i._id.EQNo);
                i.Machine=result[1].recordset[idy]["小機名稱"];
                const idx=result[1].recordset.findIndex(d=>d.VID===i._id.Addres);
                i.Params=result[1].recordset[idx]["參數名稱"];
                i.Particle_avg = String(i.avg);
                i.Particle_std = String(i.std);
                delete i._id;
                delete i.avg;
                delete i.std;
            })
            mongoData = result[0];
            
            
            res.json({
                fixedreadout: { data: mongoData, db: 'fm', table: 'particle_summary' }
                });
        })
        .catch((err) => {
            console.log(err)
        })
        .finally(() => {
            connect.close();
        })
})

router.get('/Particle_Day', (req, res) => {
    let connect;
    let mongoData = [];
    let mongoFinal = [];
    let EDC_ = [];
    
    const curDate = new Date()
    curDate.setHours(curDate.getHours()+8);
    curDate.setDate(curDate.getDate()-1);
    let date = curDate.toLocaleDateString("zh",{year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll('/','-');

    poolEdc.connect()
    .then(() => {
        return Promise.all([poolEdc.query(`select 小機編號 from [dbo].[Para_Modbus] a(nolock) where VID in ('030910') `)]);
    })
    .then((edc) => {
        EDC_ = edc[0].recordset;
        return mongodb.MongoClient.connect(mongoURI)
    })
    .then(function(connection){
        return connection.db('DatamationYM_AIOT').collection('HD')
    })
    .then(function (connection) {
            connect = connection;
            let promiseAry = [];
            EDC_.forEach((i,index) => {
                // if(index < 2){
                promiseAry.push(
                    connect
                        .aggregate([
                            { $match: { "EQNo" : `${i.小機編號}`, "Addres": { $in: ['030910','031112','031314','031516']}  }},
                            { $sort: {Inserttime: -1}},
                            { $limit: 25000 },
                            { $addFields: { Date: {$dateToString: { format: '%Y-%m-%d', date : {$toDate: {$add: [{$toLong : "$Inserttime"}, 28800000] }}}}}},
                            { $match: { Date : date  }}, // 每天改
                            { $addFields: { Value: {$toInt : "$Value" }}},
                            { $group: { _id: { Date: "$Date", EQNo: "$EQNo", Addres: "$Addres", }, totalAmount: {$sum: "$Value"}}},
                            { $sort: { _id: 1}}
                                    // { $sort: {Inserttime: -1}},
                                    // { $limit: 10000 },
                                    // { $addFields: { Date: {$dateToString: { format: '%Y-%m-%d', date: '$Inserttime' }}}},
                                    // { $match: { Date : '2024-01-04', "EQNo" : `${i.小機編號}`, "Addres": { $in: ['030910','031112','031314','031516']}  }},
                                    // { $addFields: { Value: {$toInt : "$Value" }}},
                                    // { $group: { _id: { Date: "$Date", EQNo: "$EQNo", Addres: "$Addres", }, totalAmount: {$sum: "$Value"}}},
                                    // { $sort: { _id: 1}}
                                ])
                        .toArray()
                    )
                // }
            });
            promiseAry.push(poolEdc.query(`select * from [dbo].[Para_Modbus] a(nolock)`));
            return  Promise.all(
                //'030910','031112','031314','031516'
                promiseAry           
            )
        })
        // .then((data)=>{
        //     console.log(new Date());
        //     res.json([data[0],data[1]])
        // })
        .then((result) => {
            EdcLen = result.length-1;
            result.forEach((i,index)=>{
                if(index !== EdcLen){
                    result[index].forEach((j)=>{
                        j.Date = j._id.Date;
                        j.EQNo = j._id.EQNo;
                        const idy=result[EdcLen].recordset.findIndex(d=>d.小機編號===j._id.EQNo);
                        j.Machine=result[EdcLen].recordset[idy]["小機名稱"];
                        const idx=result[EdcLen].recordset.findIndex(d=>d.VID===j._id.Addres);
                        j.Params=result[EdcLen].recordset[idx]["參數名稱"];
                        j.Particle=String(j.totalAmount);
                        delete j._id;
                        delete j.totalAmount;
                    })
                }
            });
            delete result[EdcLen];
            mongoData = result;
        })
        .then(() => {
            mongoData.forEach((i) => {if(i.length>0){i.forEach((j) => {mongoFinal.push(j)})} })
        })
        .then(() => {
            res.json({
                fixedreadout: { data: mongoFinal, db: 'fm', table: 'particle_byday' }
                });
        })
        .catch((err) => {
            console.log(err)
        });
})

module.exports = router
