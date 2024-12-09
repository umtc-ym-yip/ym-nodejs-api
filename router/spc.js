const express = require("express");
const mysql = require("mysql2");
const sql = require("mssql");
const fs = require("fs");
const { poolAcme, poolDc, poolNCN, poolSPC } = require("../mssql");
const { configFunc, configFuncS3 } = require("../config.js");
const { mysqlConnection, queryFunc } = require("../mysql.js");
const {
  timestampToYMDHIS,
  timestampToYMDHIS2,
  timestampToYMDHIS3,
} = require("../time.js");
const { connect } = require("http2");
const router = express.Router();
//去重複Function 物件適用
function removeDuplicateObjects(arr) {
  const seen = new Set();
  return arr.filter((item) => {
    const serializedItem = JSON.stringify(item);
    if (seen.has(serializedItem)) {
      return false;
    } else {
      seen.add(serializedItem);
      return true;
    }
  });
}
function convertTimestampToISO(timestamp) {
  // 創建 Date 對象
  const date = new Date(timestamp);

  // 使用 toISOString() 方法轉換為 ISO 格式
  return date.toISOString();
}

function getPreviousDate(numOfDays) {
  const date = new Date();
  date.setDate(date.getDate() - numOfDays);
  const day = date.toISOString().replace("T", " ").slice(0, 19);
  return `${day}`;
}

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE");
  res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

router.get("/image", (req, res) => {
  const url = req.query.url;
  // console.log(url);
  try {
    const imageBuffer = fs.readFileSync(`${url}`);
    // console.log(imageBuffer);

    const imageBase64 = imageBuffer.toString("base64");
    res.send(imageBase64);
  } catch (error) {
    res.send("");
  }
  res.end();
});
//SPC
router.get("/spctest", (req, res) => {
  mysqlConnection(configFunc("ymspc"))
    .then((connection) => {
      const sql = `Select alarm_type,type,fileroot,filegroup,filename,
ctrlname,ctrlid,filedepartment,
day,week,month,
count(lotnum) as lot_count 
from spc_alarm_rawdata 
where day = '240813' 
and type = 'PRD' 
and alarm_type = 'OOC' 
group by alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,filedepartment,day,week,month
`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      //  console.log([...new Set(results)]);
      // const PN = [...new Set(results.map((i) => i.PartNo))];
      // // console.log(PN);
      // //  console.log(results.filter((i) => i.PartNo === "6111A01").map((i) => i.layer));
      // let PNFB = [];
      // PN.forEach(function (item, index) {
      //   PNFB[index] = {
      //     name: item,
      //     Step: results.filter((i) => i.PartNo === item).map((i) => i.layer),
      //   };
      // });
      // console.log(PNFB);
      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/spcindex/:customer_type", async (req, res) => {
  try {
    const { customer_type } = req.params;

    const connection = await mysqlConnection(configFunc("ymspc"));
    const connections3 = await mysqlConnection(configFuncS3("s3spc"));
    const today = new Date();
    const ymd = [];
    for (let i = 6; i >= 1; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      ymd.push(year + month + day);
    }
    // 計算年W周

    // 计算当前周号
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const days = Math.floor((today - startOfYear) / (24 * 60 * 60 * 1000));
    const currentWeekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    // 格式化当前年份和周号
    const currentYear = today.getFullYear().toString().slice(-2);

    // 生成当前周和前6周的列表
    const YearWWeak = [];
    for (let i = 0; i <= 6; i++) {
      let weekNum = currentWeekNumber - i;
      let yearNum = parseInt(currentYear);
      // 处理跨年的情况
      if (weekNum <= 0) {
        weekNum += 52; // 假设每年都有52周
        yearNum -= 1;
      }
      // 格式化年份和周数
      const formattedYear = yearNum.toString().padStart(2, "0");
      const formattedWeek = weekNum.toString().padStart(2, "0");

      YearWWeak.push(`${formattedYear}W${formattedWeek}`);
    }
    // 計算當前年月和前六週的年月 年M月
    const YearMMonth = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);

      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");

      YearMMonth.push(`${year}M${month}`);
    }

    // const Lotrecord = [...new Set(result.recordset.map((i) => i.lotnumlayer))];
    // console.log("Lot Count", Lotrecord.length);
    const ymdrec = ymd.map((i) => `'${i}'`).join(",") + ",''";
    const YearWWeakrec = YearWWeak.map((i) => `'${i}'`).join(",") + ",''";
    const YearMMonthrec = YearMMonth.map((i) => `'${i}'`).join(",") + ",''";

    const sqlday = `select*from spc_info where day in (${ymdrec}) and customer_type in ('${customer_type}')`;
    const resultday = await queryFunc(connection, sqlday);

    const sqlweek = `select*from spc_info where week in (${YearWWeakrec}) and customer_type in ('${customer_type}')`;
    const resultweek = await queryFunc(connection, sqlweek);

    const sqlMonth = `select*from spc_info where month in (${YearMMonthrec}) and customer_type in ('${customer_type}')`;
    const resultMonth = await queryFunc(connection, sqlMonth);
    // res.json(sqlday)
    res.json([resultday, resultweek, resultMonth]);
    // res.json([YearMMonth,YearWWeak,ymd]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});

router.get("/chartdata/:customer_type", async (req, res) => {
  try {
    const { customer_type } = req.params;

    const connection = await mysqlConnection(configFunc("ymspc"));
    const connections3 = await mysqlConnection(configFuncS3("s3spc"));
    const today = new Date();
    const ymd = [];
    for (let i = 6; i >= 1; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      ymd.push(year + month + day);
    }
    // 計算年W周

    // 计算当前周号
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const days = Math.floor((today - startOfYear) / (24 * 60 * 60 * 1000));
    const currentWeekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    // 格式化当前年份和周号
    const currentYear = today.getFullYear().toString().slice(-2);

    // 生成当前周和前6周的列表
    const YearWWeak = [];
    for (let i = 0; i <= 6; i++) {
      let weekNum = currentWeekNumber - i;
      let yearNum = parseInt(currentYear);
      // 处理跨年的情况
      if (weekNum <= 0) {
        weekNum += 52; // 假设每年都有52周
        yearNum -= 1;
      }
      // 格式化年份和周数
      const formattedYear = yearNum.toString().padStart(2, "0");
      const formattedWeek = weekNum.toString().padStart(2, "0");

      YearWWeak.push(`${formattedYear}W${formattedWeek}`);
    }
    // 計算當前年月和前六週的年月 年M月
    const YearMMonth = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);

      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");

      YearMMonth.push(`${year}M${month}`);
    }

    const ymdrec = ymd.map((i) => `'${i}'`).join(",") + ",''";
    const YearWWeakrec = YearWWeak.map((i) => `'${i}'`).join(",") + ",''";
    const YearMMonthrec = YearMMonth.map((i) => `'${i}'`).join(",") + ",''";
    //請求數據
    const sqlday = `WITH base_data AS (
    SELECT 
        day,
        customer_type,
        alarm_type,
        type,
        SUM(alarm_lot) AS alarm_lot,
        SUM(total_lot) AS total_lot,
        CAST(SUM(alarm_lot) AS FLOAT) / NULLIF(SUM(total_lot), 0) AS alarm_lot_ratio
    FROM 
        spc_info
    WHERE
      day IN (${ymdrec}) 
      AND customer_type IN ('${customer_type}')
    GROUP BY 
        day, customer_type, alarm_type, type
)
SELECT * FROM (
    SELECT 
        day,
        customer_type,
        alarm_type,
        type,
        alarm_lot,
        total_lot,
        alarm_lot_ratio
    FROM 
        base_data
    UNION ALL
    SELECT 
        day,
        customer_type,
        alarm_type,
        'total' AS type,
        SUM(alarm_lot) AS alarm_lot,
        SUM(total_lot) AS total_lot,
        CAST(SUM(alarm_lot) AS FLOAT) / NULLIF(SUM(total_lot), 0) AS alarm_lot_ratio
    FROM 
        base_data
    GROUP BY 
        day, customer_type, alarm_type
) result_set
ORDER BY 
    day, customer_type, alarm_type, type`;
    const resultday = await queryFunc(connection, sqlday);

    const sqlweek = `WITH base_data AS (
    SELECT 
        week,
        customer_type,
        alarm_type,
        type,
        SUM(alarm_lot) AS alarm_lot,
        SUM(total_lot) AS total_lot,
        CAST(SUM(alarm_lot) AS FLOAT) / NULLIF(SUM(total_lot), 0) AS alarm_lot_ratio
    FROM 
        spc_info
    WHERE 
      week in (${YearWWeakrec}) 
      AND customer_type IN ('${customer_type}')
    GROUP BY 
        week, customer_type, alarm_type, type
)
SELECT * FROM (
    SELECT 
        week,
        customer_type,
        alarm_type,
        type,
        alarm_lot,
        total_lot,
        alarm_lot_ratio
    FROM 
        base_data
    UNION ALL
    SELECT 
        week,
        customer_type,
        alarm_type,
        'total' AS type,
        SUM(alarm_lot) AS alarm_lot,
        SUM(total_lot) AS total_lot,
        CAST(SUM(alarm_lot) AS FLOAT) / NULLIF(SUM(total_lot), 0) AS alarm_lot_ratio
    FROM 
        base_data
    GROUP BY 
        week, customer_type, alarm_type
) result_set
ORDER BY 
    week, customer_type, alarm_type, type`;

    const resultweek = await queryFunc(connection, sqlweek);

    const sqlMonth = `WITH base_data AS (
    SELECT 
        month,
        customer_type,
        alarm_type,
        type,
        SUM(alarm_lot) AS alarm_lot,
        SUM(total_lot) AS total_lot,
        CAST(SUM(alarm_lot) AS FLOAT) / NULLIF(SUM(total_lot), 0) AS alarm_lot_ratio
    FROM 
        spc_info
    WHERE 
      month in (${YearMMonthrec}) 
      AND customer_type IN ('${customer_type}')
    GROUP BY 
        month, customer_type, alarm_type, type
)
SELECT * FROM (
    SELECT 
        month,
        customer_type,
        alarm_type,
        type,
        alarm_lot,
        total_lot,
        alarm_lot_ratio
    FROM 
        base_data
    UNION ALL
    SELECT 
        month,
        customer_type,
        alarm_type,
        'total' AS type,
        SUM(alarm_lot) AS alarm_lot,
        SUM(total_lot) AS total_lot,
        CAST(SUM(alarm_lot) AS FLOAT) / NULLIF(SUM(total_lot), 0) AS alarm_lot_ratio
    FROM 
        base_data
    GROUP BY 
        month, customer_type, alarm_type
) result_set
ORDER BY 
    month, customer_type, alarm_type, type`;

    const resultMonth = await queryFunc(connection, sqlMonth);
    // res.json(sqlday)
    res.json([resultday, resultweek, resultMonth]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});
//SPC 畫圖資料
router.get("/spcalarm/:customer_type", async (req, res) => {
  try {
    const { customer_type } = req.params;

    const connection = await mysqlConnection(configFunc("ymspc"));
    const connections3 = await mysqlConnection(configFuncS3("s3spc"));
    const today = new Date();
    const ymd = [];
    for (let i = 6; i >= 1; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      ymd.push(year + month + day);
    }
    // 計算年W周

    // 计算当前周号
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const days = Math.floor((today - startOfYear) / (24 * 60 * 60 * 1000));
    const currentWeekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    // 格式化当前年份和周号
    const currentYear = today.getFullYear().toString().slice(-2);

    // 生成当前周和前6周的列表
    const YearWWeak = [];
    for (let i = 0; i <= 6; i++) {
      let weekNum = currentWeekNumber - i;
      let yearNum = parseInt(currentYear);
      // 处理跨年的情况
      if (weekNum <= 0) {
        weekNum += 52; // 假设每年都有52周
        yearNum -= 1;
      }
      // 格式化年份和周数
      const formattedYear = yearNum.toString().padStart(2, "0");
      const formattedWeek = weekNum.toString().padStart(2, "0");

      YearWWeak.push(`${formattedYear}W${formattedWeek}`);
    }
    // 計算當前年月和前六週的年月 年M月
    const YearMMonth = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);

      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, "0");

      YearMMonth.push(`${year}M${month}`);
    }

    // const Lotrecord = [...new Set(result.recordset.map((i) => i.lotnumlayer))];
    // console.log("Lot Count", Lotrecord.length);
    const ymdrec = ymd.map((i) => `'${i}'`).join(",") + ",''";
    const YearWWeakrec = YearWWeak.map((i) => `'${i}'`).join(",") + ",''";
    const YearMMonthrec = YearMMonth.map((i) => `'${i}'`).join(",") + ",''";

    const sqldayalarm = `WITH base_data AS (
    SELECT 
        alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,lotnum,filedepartment,day,week,month,
        1 as total_lot_count
    FROM 
        spc_alarm_rawdata
    WHERE
      day IN (${ymdrec}) 
      AND fileroot IN ('${customer_type}')
    GROUP BY 
        alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,lotnum,filedepartment,day,week,month
    )
    SELECT * FROM (
      SELECT 
        month,
        week,
        day,
        fileroot,
        type,
        filedepartment,
        alarm_type,
        SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        month, week, day, fileroot, type, filedepartment, alarm_type
    UNION ALL
    SELECT 
        month,
        week,
        day,
        fileroot,
        'total' as type,
        filedepartment,
        alarm_type,
        SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        month,
        week,
        day,
        fileroot,
        filedepartment,
        alarm_type
    ) result_set
ORDER BY 
    month, week, day, fileroot, type, filedepartment, alarm_type`;

    const resultdayalarm = await queryFunc(connection, sqldayalarm);

    const sqlweekalarm = `WITH base_data AS (
    SELECT 
        alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,lotnum,filedepartment,day,Week,Month,
        1 as total_lot_count
    FROM 
        spc_alarm_rawdata
    WHERE week IN (${YearWWeakrec}) AND fileroot IN ('${customer_type}')
    GROUP BY 
        alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,lotnum,filedepartment,day,Week,Month
)
SELECT * FROM (
    SELECT 
        month,
        week,
        fileroot,
        type,
        filedepartment,
        alarm_type,
        SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        month, week, fileroot, type, filedepartment, alarm_type
    
    UNION ALL
    
    SELECT 
        month,
        week,
        fileroot,
        'total' as type,
        filedepartment,
        alarm_type,
        SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        month, week, fileroot, filedepartment, alarm_type
) result_set
ORDER BY 
    month, week, fileroot, type, filedepartment, alarm_type`;

    const resultweekalarm = await queryFunc(connection, sqlweekalarm);
    const sqlMonthalarm = `WITH base_data AS (
    SELECT 
        alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,lotnum,filedepartment,day,Week,Month,
        1 as total_lot_count
    FROM 
        spc_alarm_rawdata
    WHERE
      month IN (${YearMMonthrec}) 
      AND fileroot IN ('${customer_type}')
    GROUP BY 
        alarm_type,type,fileroot,filegroup,filename,ctrlname,ctrlid,lotnum,filedepartment,day,week,month
)
SELECT * FROM (
    SELECT 
        month,
        fileroot,
        type,
        filedepartment,
        alarm_type,
        SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        month, fileroot, type, filedepartment, alarm_type
    UNION ALL
    
    SELECT 
        month,
        fileroot,
        'total' as type,
        filedepartment,
        alarm_type,
        SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        month, fileroot, filedepartment, alarm_type
) result_set
ORDER BY 
    month, fileroot, type, filedepartment, alarm_type`;
    const resultMonthalarm = await queryFunc(connection, sqlMonthalarm);
    // res.json(sqlday)
    res.json([resultdayalarm, resultweekalarm, resultMonthalarm]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});
router.get("/spcalarmdaily/:factory/:type/:alarm/:day", async (req, res) => {
  try {
    const { factory, type, alarm, day } = req.params;
    const typeFilter = type === "total" ? "" : `AND type = '${type}'`;
    const connection = await mysqlConnection(configFunc("ymspc"));
    const sql = `WITH base_data AS (SELECT fileroot,filegroup,filename,ctrlid,ctrlname,1 as total_lot_count,lotnum,day,week,month,alarm_type,type FROM spc_alarm_rawdata WHERE day = '${day}' AND fileroot = '${factory}' ${typeFilter} AND alarm_type = '${alarm}')
    SELECT * FROM (
    SELECT 
        fileroot,filegroup,filename,ctrlid,ctrlname,day,week,month,alarm_type,type,SUM(total_lot_count) as total_lot_count
    FROM 
        base_data
    GROUP BY 
        fileroot,filegroup,filename,ctrlid,ctrlname,day,week,month,alarm_type,type
) result_set
ORDER BY 
    fileroot,filegroup,filename,ctrlid,ctrlname,day,week,month,alarm_type,type`;

    const result = await queryFunc(connection, sql);

    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});
router.get("/spcalarmtrend/:factory/:ctrlid", async (req, res) => {
  const { factory, ctrlid } = req.params;

  const sql = `SELECT top 150
          a.FileGroupName,
          b.filegroupname,
          c.FileName,
          d.ctrlname,
          d.CtrlID,
          e.MeasTime,
          FileDepartment,
          FileCharacter,
          d.USL,d.SL,d.LSL,
          d.TOPUCL,d.TOPCL,d.TOPLCL,
          AVG(CAST(f.MeasData AS FLOAT)) as MeasData
          FROM Var_FileGroup a(nolock),var_filegroup b(nolock),Var_File c(nolock),var_ctrl d(nolock),Var_DataGroup e(nolock),Var_Data f(nolock)
          WHERE b.fatherroot = a.filegroupid
          and b.filegroupid = c.filegroupid
          and c.fileid = d.fileid
          and e.CtrlID = d.ctrlid
          and f.DataGroupID = e.DataGroupID
          and a.FileGroupName = '${factory}'
          and d.IsCtrl='1'
          and e.NoCalculate = '0'
          and d.CtrlID = '${ctrlid}'
          group by a.FileGroupName,
          b.filegroupname,
          c.FileName,
          d.ctrlname,
          d.CtrlID,
          e.MeasTime,
          FileDepartment,
          FileCharacter,
          d.USL,d.SL,d.LSL,
          d.TOPUCL,d.TOPCL,d.TOPLCL
          order by e.MeasTime desc`;
  poolSPC
    .query(sql)
    .then((result) => {
      res.json(result.recordset);
    })
    .catch((err) => {
      console.log(err);
    });
});
router.get("/spcalrammeantrend/:factory/:ctrlid", async (req, res) => {
  const { factory, ctrlid } = req.params;
  const sql = `SELECT top 150
          a.FileGroupName,
          b.filegroupname,
          c.FileName,
          d.ctrlname,
          d.CtrlID,
          e.MeasTime,
          FileDepartment,
          FileCharacter,
          d.USL,d.SL,d.LSL,
          d.TOPUCL,d.TOPCL,d.TOPLCL,
          AVG(CAST(f.MeasData AS FLOAT)) as MeasData
          FROM Var_FileGroup a(nolock),var_filegroup b(nolock),Var_File c(nolock),var_ctrl d(nolock),Var_DataGroup e(nolock),Var_Data f(nolock)
          WHERE b.fatherroot = a.filegroupid
          and b.filegroupid = c.filegroupid
          and c.fileid = d.fileid
          and e.CtrlID = d.ctrlid
          and f.DataGroupID = e.DataGroupID
          and a.FileGroupName = '${factory}'
          and d.IsCtrl='1'
          and e.NoCalculate = '0'
          and d.CtrlID = '${ctrlid}'
          group by a.FileGroupName,
          b.filegroupname,
          c.FileName,
          d.ctrlname,
          d.CtrlID,
          e.MeasTime,
          FileDepartment,
          FileCharacter,
          d.USL,d.SL,d.LSL,
          d.TOPUCL,d.TOPCL,d.TOPLCL
          order by e.MeasTime desc`;
  poolSPC
    .query(sql)
    .then((result) => {
      res.json(result.recordset);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/spcalarmmachine/:factory/:ctrlid", async (req, res) => {
  const { factory, ctrlid } = req.params;

  const sql = `SELECT top 150
                a.FileGroupName,
                b.filegroupname,
                c.FileName,
                d.ctrlname,
                d.CtrlID,
                e.MeasTime,
                FileDepartment,
                FileCharacter,
                d.USL,d.SL,d.LSL,
                d.TOPUCL,d.TOPCL,d.TOPLCL,
                f.MeasData,
                e.L79, e.L98, e.L99, e.L100, e.L53, e.L84, f.SN,e.L52
                FROM Var_FileGroup a(nolock),var_filegroup b(nolock),Var_File c(nolock),var_ctrl d(nolock),Var_DataGroup e(nolock),Var_Data f(nolock)
                WHERE b.fatherroot = a.filegroupid
                and b.filegroupid = c.filegroupid
                and c.fileid = d.fileid
                and e.CtrlID = d.ctrlid
                and f.DataGroupID = e.DataGroupID
                and a.FileGroupName = '${factory}'
                and d.IsCtrl='1'
                and e.NoCalculate = '0'
                and d.CtrlID = '${ctrlid}'
                order by e.MeasTime desc`;

  poolSPC
    .query(sql)
    .then((result) => {
      res.json(result.recordset);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/spc2rdlist/:factory", async (req, res) => {

  const { factory } = req.params;
  const sql = ` SELECT distinct b.filegroupname
                FROM Var_FileGroup a(nolock),var_filegroup b(nolock),Var_File c(nolock)
                WHERE b.fatherroot = a.filegroupid
                and b.filegroupid = c.filegroupid
                and a.FileGroupName = '${factory}'
`;
  poolSPC
    .query(sql)
    .then((result) => {
      res.json(result.recordset);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/spc2rddata/:factory/:filegroupname", async (req, res) => {
  const { factory, filegroupname } = req.params;

  const sql = `SELECT a.FileGroupName,c.FileName, d.CtrlName, d.ctrlid
FROM Var_FileGroup a(nolock),var_filegroup b(nolock),Var_File c(nolock),var_ctrl d(nolock)
WHERE b.fatherroot = a.filegroupid
                    and b.filegroupid = c.filegroupid
                    and c.fileid = d.fileid
                    and d.IsCtrl='1'
                    and a.FileGroupName = '${factory}'
                    and b.filegroupname = '${filegroupname}'`;
  poolSPC
    .query(sql)
    .then((result) => {
      res.json(result.recordset);
    })
    .catch((err) => {
      console.log(err);
    });
});
module.exports = router;
