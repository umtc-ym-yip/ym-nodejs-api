const express = require("express");
const mysql = require("mysql2");
const sql = require("mssql");
const fs = require("fs");
const { poolAcme, poolDc, poolNCN } = require("../mssql");
const { configFunc } = require("../config.js");
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

router.get("/machine/:lotnum", (req, res) => {
  const lot = req.params;
  poolAcme
    .query(
      `select * from (select distinct CONVERT(varchar,m.ChangeTime, 120) time,m.lotnum,m.proccode,m.partnum,m.layer,n.MachineName,o.LayerName,p.ProcName, Rank() over (partition by m.lotnum, m.layer, p.ProcName order by m.ChangeTime desc) Rank from PDL_CKHistory(nolock) m inner join PDL_Machine n on m.Machine=n.MachineId inner join NumofLayer o on m.layer=o.Layer inner join ProcBasic p on m.proccode = p.ProcCode where m.proccode in ('LDL01','LTH23','LTH25','UVL01','FLI06', 'SMK10') and m.lotnum in ('${lot.lotnum}') and m.BefStatus in ('MoveIn') and m.AftStatus in ('CheckIn') ) dt 
      where Rank = 1 order by time asc`
    )
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});

//抓近10天有Readout的PN
router.get("/getpnfb1", (req, res) => {
  poolAcme
    .query(
      `select distinct left(m.partnum,7) partnum, o.ProdClass,
              n.NumOfLayer, n.CIP_proctype from PDL_CKHistory(nolock) m inner join prodbasic n on m.partnum = n.PartNum inner join prodbasic o on m.partnum=o.PartNum
                where proccode in('PTH24') and ChangeTime >= '${getPreviousDate(
                  5
                )}' and n.CIP_proctype not like ('%//%')
                  order by left(m.partnum,7)`
    )
    .then((results) => {
      // console.log(results)
      let partno = results.recordset.filter(
        (i) =>
          i.partnum.substr(0, 4) === "3273" || i.partnum.substr(0, 4) === "6111"
      );

      // console.log(partno);
      let partnofb = [];
      let ct = 0;
      partno.forEach(function (item, index) {
        let step = [];
        // if (partno[index].partnum !== partno[index - 1 < 0 ? 0 : index - 1].partnum) {
        let fbcount =
          item.partnum.substr(0, 4) === "3273"
            ? parseInt(item.NumOfLayer, 10) / 2
            : parseInt(item.CIP_proctype.split("/")[0]) + 1;
        // console.log(item)
        for (let i = 2; i < fbcount; i++) {
          step.push(i + "FB");
        }
        step.push("-Outer");

        partnofb[ct] = {
          ProdClass: item.ProdClass,
          name: item.partnum,
          Step: step,
        };
        ct += 1;
        // }
      });
      // partnofb.filter((value) => {
      //   // 檢查是否為空值
      //   return value != null && value !== '' && value !== undefined && !isNaN(value) && value !== false && value !== 0;
      // });
      // console.log(partnofb);
      res.json(partnofb);
    })
    .catch((err) => {
      console.log(err);
      // console.log(getPreviousDate(30));
    });
});

router.get("/getdepnfb/:st/:et", (req, res) => {
  const { st, et } = req.params;
  const curDate = new Date(st);
  const curDatesixty = new Date(et);
  poolAcme
    .query(
      `select distinct left(m.partnum,7) partnum, o.ProdClass,
              n.NumOfLayer, n.CIP_proctype from PDL_CKHistory(nolock) m 
              inner join prodbasic n on m.partnum = n.PartNum 
              inner join prodbasic o on m.partnum=o.PartNum
                where proccode in('PTH24') 
                and ChangeTime BETWEEN '${convertTimestampToISO(Number(st))}' 
                AND '${convertTimestampToISO(Number(et))}' 
                and n.CIP_proctype not like ('%//%')
                and (left(m.partnum, 4) = '3273' or left(m.partnum, 4) = '6111')
                order by left(m.partnum,7)`
    )
    .then((results) => {
      let partnofb = results.recordset.map(item => {
        console.log(item);
        let fbcount = parseInt(item.NumOfLayer, 10) / 2;
        console.log(fbcount);
        let step = Array.from({ length: fbcount - 2 }, (_, i) => `${i + 2}FB`).concat("-Outer");
        console.log(step);
        let tri = Array.from({ length: fbcount - 2 }, (_, i) => 25 + (i + 2) * 5).concat(25 + (fbcount - 1) * 5);
        if(step[step.length-1]==='-Outer'){
          tri[tri.length-1]=Number(tri[tri.length-1])+5
        }
        console.log(tri);
        return {
          ProdClass: item.ProdClass,
          name: item.partnum,
          Step: step,
          trigger: tri,
        };
      });
      partnofb = removeDuplicateObjects(partnofb);
      res.json(partnofb);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/getpnfb", (req, res) => {
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT * FROM sawshiftfb`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      //  console.log([...new Set(results)]);
      const PN = [...new Set(results.map((i) => i.PartNo))];
      // console.log(PN);
      //  console.log(results.filter((i) => i.PartNo === "6111A01").map((i) => i.layer));
      let PNFB = [];
      PN.forEach(function (item, index) {
        PNFB[index] = {
          name: item,
          Step: results.filter((i) => i.PartNo === item).map((i) => i.layer),
        };
      });
      // console.log(PNFB);
      res.json(PNFB);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/fourquadrant", (req, res) => {
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT * FROM fourquadrant`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      const tri = results.filter((item) => {
        return Date.parse(item.meastime) >= Date.parse(getPreviousDate(10));
      });

      res.json(tri);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/sawshiftdata/:lotno", (req, res) => {
  const LN = req.params;
  // console.log(LN.lotno);
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT partno,lotno,FB,dxdy,quad,stage,
      meastime,avg(csdif) csdif FROM sawshiftdata where lotno in ('${LN.lotno}') group by partno,lotno,FB,dxdy,quad,stage,
      meastime order by meastime asc`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      // console.log(results);
      // const tri = results.filter((item) => {
      //   return Date.parse(item.meastime) >= Date.parse(getPreviousDate(10));
      // });

      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/sawshiftdata/:partno/:FB", (req, res) => {
  const data = req.params;
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT * FROM sawshiftdata where partno in ('${data.partno}')`; //要加時間區間
      // console.log(sql);
      return queryFunc(connection, sql);
    })
    .then((results) => {
      //篩選出要畫圖的批號
      const uniqueLN = [
        ...new Set(
          results
            .filter((results) => data.FB === results.FB)
            .map((item) => item.lotno)
        ),
      ];
      // console.log(uniqueLN);
      //篩選出要畫圖的資料
      const inculde = results.filter((item) => uniqueLN.includes(item.lotno));
      const inculded = inculde.filter((item) => {
        if (data.FB === "-Outer") {
          return true;
        } else if (
          (data.FB.length == 4
            ? parseInt(data.FB.substring(0, 2))
            : parseInt(data.FB.substring(0, 1))) >=
          (item.FB.length == 4
            ? parseInt(item.FB.substring(0, 2))
            : parseInt(item.FB.substring(0, 1)))
        ) {
          return true;
        }
      });
      let container = [];
      let mestime = "";
      const conditionArray = [
        ...new Set(
          inculded.map(
            (f) => `${f.lotno}_${f.dxdy}_${f.quad}_${f.stage}_${f.SN}`
          )
        ),
      ];
      conditionArray.forEach((c) => {
        const data1 = inculded.filter((f) => {
          const [lotno, dxdy, quad, stage, SN] = c.split("_");
          return (
            f.lotno === lotno &&
            f.dxdy === dxdy &&
            f.quad === quad &&
            f.stage === stage &&
            f.SN === SN
          );
        });

        const sum = data1
          .map((d) => d.csdif)
          .reduce((a, b) => parseFloat(a) + parseFloat(b), 0);
        container.push({ label: c, value: sum });
        // container=sum;
      });
      container.forEach((item) => {
        const [lotno, dxdy, quad, stage, SN] = item.label.split("_");

        // console.log(lotno,dxdy,quad,stage,SN);
        // console.log(item.label);
        item.time = inculded
          .filter(
            (i) =>
              i.lotno === lotno &&
              i.dxdy === dxdy &&
              i.quad === quad &&
              i.stage === stage &&
              i.SN === SN
          )
          .sort(
            (a, b) => new Date(b.meastime) - new Date(a.meastime)
          )[0].meastime;
        item.lotno = lotno;
        item.dxdy = dxdy;
        item.quad = quad;
        item.stage = stage;
        item.SN = SN;
      });
      //console.log(data1);
      res.json(container);
    })
    .catch((err) => {
      res.json([]);
      console.log(err);
    });
});

//抓LDL機台資料畫盒鬚圖
router.get("/sawshiftmachinedata/:st/:et/:PN/:FB", (req, res) => {
  const { st, et, PN, FB } = req.params;
  // console.log(st, et, PN, FB);
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT a.*, CONCAT(a.LDLMachine,'_', a.stage) AS machinestage ,ROUND(a.LDLCSDif, 2) AS LDLCSDif
FROM sawshiftvpstage a WHERE a.PN='${PN}' AND a.FB='${FB}'`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});
//LDL機台資料所有PN資料
router.get("/sawshiftgetpnldl", (req, res) => {
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT DISTINCT a.PN FROM sawshiftvpstage a`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});

//抓LTH機台資料畫盒鬚圖
router.get("/sawshiftmachinedataLTH/:st/:et/:PN/:FB", (req, res) => {
  const { st, et, PN, FB } = req.params;
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT a.PN,a.lotnum,a.Layer,a.LTHMeasTime,a.DXDY,a.FB,a.SN,a.LTHMachine,a.quad ,ROUND(a.LTHCSDifMean*-1,2) as LTHCSDifMean FROM sawshiftpadtovia a WHERE a.PN='${PN}' AND a.FB='${FB}'`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});
//LTH機台資料所有PN資料
router.get("/sawshiftgetpnlth", (req, res) => {
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT DISTINCT a.PN FROM sawshiftpadtovia a`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      res.json(results);
    })
    .catch((err) => {
      console.log(err);
    });
});
//抓出Trigger的點的Table
router.get("/sawshiftdatapvvpdaily/:st/:et", async (req, res) => {
  let connection;
  try {
    const { st, et } = req.params;
    const time1 = new Date();
    // console.log(time1);

    connection = await mysqlConnection(configFunc("sawshift"));

    const curDate = new Date(st);
    const curDatesixty = new Date(et);

    const sqlCVI = `
    SELECT DISTINCT
      m.ChangeTime,
      FORMAT(m.ChangeTime, 'yyyy-MM-dd HH:mm:ss') AS ChangeTime1,
      TRIM(m.lotnum) AS lotnum,
      TRIM(u.LayerName) AS LayerName,
      CONCAT(TRIM(m.lotnum), TRIM(u.LayerName)) AS lotnumlayer
    FROM 
      PDL_CKHistory(NOLOCK) m
    INNER JOIN 
      ClassIssType(NOLOCK) t ON m.isstype = t.ITypeCode
    INNER JOIN 
      NumofLayer(NOLOCK) u ON m.layer = u.Layer
    WHERE 
      proccode IN ('PTH24')
      AND m.ChangeTime BETWEEN '${convertTimestampToISO(Number(st)+28800000)}' AND '${convertTimestampToISO(Number(et)+28800000)}'
      AND t.ITypeName NOT LIKE '%E3%'
      AND AftStatus = 'CheckIn'
      AND CancelTime IS NULL
    ORDER BY 
      m.ChangeTime
    `;

    const result = await poolAcme.query(sqlCVI);
    
    const Lotrecord = [...new Set(result.recordset.map((i) => i.lotnumlayer))];
    // console.log("Lot Count", Lotrecord.length);

    const lotre = Lotrecord.map((i) => `'${i}'`).join(",") + "''";

    const sql = `
      SELECT a.*, b.LTHMeasTime, b.LTHMachine,
  ROUND(b.LTHCSDifMax, 4) as LTHCSDifMax, 
  ROUND(b.LTHCSDifMin, 4) as LTHCSDifMin,
  ROUND(b.LTHCSDifMean, 4) as LTHCSDifMean,
  ROUND(b.LTHCSDifMaxStack, 4) as LTHCSDifMaxStack,
  ROUND(b.LTHCSDifMinStack, 4) as LTHCSDifMinStack,
  ROUND(b.LTHCSDifMeanStack, 4) as LTHCSDifMeanStack
FROM (
  SELECT m.PN, m.lotnum, m.Layer, m.LDLMeasTime, m.DXDY, m.LDLMachine, m.FB, m.quad,
    AVG(m.LDLCSDifMax) as LDLCSDifMax,
    AVG(m.LDLCSDifMin) as LDLCSDifMin,
    AVG(m.LDLCSDifMean) as LDLCSDifMean,
    AVG(m.LDLCSDifMaxStack) as LDLCSDifMaxStack,
    AVG(m.LDLCSDifMinStack) as LDLCSDifMinStack,
    AVG(m.LDLCSDifMeanStack) as LDLCSDifMeanStack
  FROM sawshiftviatopad m
  GROUP BY PN, lotnum, Layer, LDLMeasTime, DXDY, LDLMachine, FB, quad
) a
inner JOIN (
  SELECT m.PN, m.lotnum, m.Layer, m.LTHMeasTime, m.DXDY, m.LTHMachine, m.FB, m.quad,
    AVG(m.LTHCSDifMax) as LTHCSDifMax,
    AVG(m.LTHCSDifMin) as LTHCSDifMin,
    AVG(m.LTHCSDifMean) as LTHCSDifMean,
    AVG(m.LTHCSDifMaxStack) as LTHCSDifMaxStack,
    AVG(m.LTHCSDifMinStack) as LTHCSDifMinStack,
    AVG(m.LTHCSDifMeanStack) as LTHCSDifMeanStack
  FROM sawshiftpadtovia m
  GROUP BY PN, lotnum, Layer, LTHMeasTime, DXDY, LTHMachine, FB, quad
) b ON a.lotnum = b.lotnum AND a.Layer = b.Layer AND a.DXDY = b.DXDY AND a.quad = b.quad
WHERE CONCAT(a.lotnum, a.Layer) IN (${lotre})
    `;

    const results = await queryFunc(connection, sql);
    res.json(results);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        console.error("Error closing database connection:", err);
      }
    }
  }
});

router.get("/sawshiftdatapvvp/:st/:et", async (req, res) => {
  let connection;
  try {
    const { st, et } = req.params;
    const time1 = new Date();
    // console.log(time1);

    connection = await mysqlConnection(configFunc("sawshift"));

    const curDate = new Date(st);
    const curDatesixty = new Date(et);

    const sqlCVI = `
      SELECT DISTINCT m.ChangeTime, TRIM(m.lotnum) as lotnum 
      FROM PDL_CKHistory(nolock) m 
      INNER JOIN ClassIssType(nolock) t ON m.isstype = t.ITypeCode 
      WHERE proccode IN ('PTH24') 
        AND m.ChangeTime BETWEEN '${convertTimestampToISO(
          Number(st)
        )}' AND '${convertTimestampToISO(Number(et))}'
        AND t.ITypeName NOT LIKE '%E3%' 
        AND AftStatus = 'CheckIn' 
        AND CancelTime IS NULL
    `;

    const result = await poolAcme.query(sqlCVI);

    const Lotrecord = [...new Set(result.recordset.map((i) => i.lotnum))];
    // console.log("Lot Count", Lotrecord.length);

    const lotre = Lotrecord.map((i) => `'${i}'`).join(",") + "''";

    const sql = `
      SELECT a.*, b.LTHMeasTime, b.LTHMachine, 
        ROUND(b.LTHCSDifMax, 4) as LTHCSDifMax, 
        ROUND(b.LTHCSDifMin, 4) as LTHCSDifMin,
        ROUND(b.LTHCSDifMean, 4) as LTHCSDifMean,
        ROUND(b.LTHCSDifMaxStack, 4) as LTHCSDifMaxStack,
        ROUND(b.LTHCSDifMinStack, 4) as LTHCSDifMinStack,
        ROUND(b.LTHCSDifMeanStack, 4) as LTHCSDifMeanStack
      FROM (
        SELECT m.PN, m.lotnum, m.Layer, m.LDLMeasTime, m.DXDY, m.LDLMachine, m.FB, m.quad,
          AVG(m.LDLCSDifMax) as LDLCSDifMax,
          AVG(m.LDLCSDifMin) as LDLCSDifMin,
          AVG(m.LDLCSDifMean) as LDLCSDifMean,
          AVG(m.LDLCSDifMaxStack) as LDLCSDifMaxStack,
          AVG(m.LDLCSDifMinStack) as LDLCSDifMinStack,
          AVG(m.LDLCSDifMeanStack) as LDLCSDifMeanStack
        FROM sawshiftviatopad m
        GROUP BY PN, lotnum, Layer, LDLMeasTime, DXDY, LDLMachine, FB, quad
      ) a
      inner JOIN (
        SELECT m.PN, m.lotnum, m.Layer, m.LTHMeasTime, m.DXDY, m.LTHMachine, m.FB, m.quad,
          AVG(m.LTHCSDifMax) as LTHCSDifMax,
          AVG(m.LTHCSDifMin) as LTHCSDifMin,
          AVG(m.LTHCSDifMean) as LTHCSDifMean,
          AVG(m.LTHCSDifMaxStack) as LTHCSDifMaxStack,
          AVG(m.LTHCSDifMinStack) as LTHCSDifMinStack,
          AVG(m.LTHCSDifMeanStack) as LTHCSDifMeanStack
        FROM sawshiftpadtovia m
        GROUP BY PN, lotnum, Layer, LTHMeasTime, DXDY, LTHMachine, FB, quad
      ) b ON a.lotnum = b.lotnum AND a.Layer = b.Layer AND a.DXDY = b.DXDY AND a.quad = b.quad
      WHERE a.lotnum IN (${lotre})
    `;

    const results = await queryFunc(connection, sql);
    res.json(results);
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        console.log("Error closing database connection:", err);
      }
    }
  }
});

//測試
router.get("/sawshiftdatapvvpdaily1/:st/:et", async (req, res) => {
  let connection;
  try {
    const { st, et } = req.params;
    connection = await mysqlConnection(configFunc("sawshift"));

    // console.log(timestampToYMDHIS(Number(st)));

    const sql = `SELECT 
    a.PN, a.lotnum, a.Layer, a.LDLMeasTime, a.DXDY, a.LDLMachine, a.FB, a.quad,
    a.LDLCSDifMax, a.LDLCSDifMin, a.LDLCSDifMean, 
    a.LDLCSDifMaxStack, a.LDLCSDifMinStack, a.LDLCSDifMeanStack,
    b.LTHMeasTime, b.LTHMachine,
    AVG(ROUND(b.LTHCSDifMax, 4)) as LTHCSDifMax,
    AVG(ROUND(b.LTHCSDifMin, 4)) as LTHCSDifMin,
    AVG(ROUND(b.LTHCSDifMean, 4)) as LTHCSDifMean,
    AVG(ROUND(b.LTHCSDifMaxStack, 4)) as LTHCSDifMaxStack,
    AVG(ROUND(b.LTHCSDifMinStack, 4)) as LTHCSDifMinStack,
    AVG(ROUND(b.LTHCSDifMeanStack, 4)) as LTHCSDifMeanStack
FROM (
    SELECT 
        m.PN, m.lotnum, m.Layer, m.LDLMeasTime, m.DXDY, m.LDLMachine, m.FB, m.quad,
        AVG(m.LDLCSDifMax) as LDLCSDifMax,
        AVG(m.LDLCSDifMin) as LDLCSDifMin,
        AVG(m.LDLCSDifMean) as LDLCSDifMean,
        AVG(m.LDLCSDifMaxStack) as LDLCSDifMaxStack,
        AVG(m.LDLCSDifMinStack) as LDLCSDifMinStack,
        AVG(m.LDLCSDifMeanStack) as LDLCSDifMeanStack 
    FROM sawshiftviatopad m 
    GROUP BY PN, lotnum, Layer, LDLMeasTime, DXDY, LDLMachine, FB, quad
) a
LEFT JOIN (
    SELECT 
        m.PN, m.lotnum, m.Layer, m.LTHMeasTime, m.DXDY, m.LTHMachine, m.FB, m.quad,
        AVG(m.LTHCSDifMax) as LTHCSDifMax,
        AVG(m.LTHCSDifMin) as LTHCSDifMin,
        AVG(m.LTHCSDifMean) as LTHCSDifMean,
        AVG(m.LTHCSDifMaxStack) as LTHCSDifMaxStack,
        AVG(m.LTHCSDifMinStack) as LTHCSDifMinStack,
        AVG(m.LTHCSDifMeanStack) as LTHCSDifMeanStack
    FROM sawshiftpadtovia m 
    GROUP BY PN, lotnum, Layer, LTHMeasTime, DXDY, LTHMachine, FB, quad
) b ON a.lotnum = b.lotnum AND a.Layer = b.Layer AND a.DXDY = b.DXDY AND a.quad = b.quad 
WHERE a.LDLMeasTime BETWEEN '${timestampToYMDHIS(
      Number(st)
    )}' AND '${timestampToYMDHIS(Number(et))}'
  AND a.PN IS NOT NULL AND b.PN IS NOT NULL
GROUP BY 
    a.PN, a.lotnum, a.Layer, a.LDLMeasTime, a.DXDY, a.LDLMachine, a.FB, a.quad,
    b.LTHMeasTime, b.LTHMachine

UNION ALL

SELECT 
    a.PN, a.lotnum, a.Layer, a.LDLMeasTime, a.DXDY, a.LDLMachine, a.FB, a.quad,
    a.LDLCSDifMax, a.LDLCSDifMin, a.LDLCSDifMean, 
    a.LDLCSDifMaxStack, a.LDLCSDifMinStack, a.LDLCSDifMeanStack,
    b.LTHMeasTime, b.LTHMachine,
    AVG(ROUND(b.LTHCSDifMax, 4)) as LTHCSDifMax,
    AVG(ROUND(b.LTHCSDifMin, 4)) as LTHCSDifMin,
    AVG(ROUND(b.LTHCSDifMean, 4)) as LTHCSDifMean,
    AVG(ROUND(b.LTHCSDifMaxStack, 4)) as LTHCSDifMaxStack,
    AVG(ROUND(b.LTHCSDifMinStack, 4)) as LTHCSDifMinStack,
    AVG(ROUND(b.LTHCSDifMeanStack, 4)) as LTHCSDifMeanStack
FROM (
    SELECT 
        m.PN, m.lotnum, m.Layer, m.LDLMeasTime, m.DXDY, m.LDLMachine, m.FB, m.quad,
        AVG(m.LDLCSDifMax) as LDLCSDifMax,
        AVG(m.LDLCSDifMin) as LDLCSDifMin,
        AVG(m.LDLCSDifMean) as LDLCSDifMean,
        AVG(m.LDLCSDifMaxStack) as LDLCSDifMaxStack,
        AVG(m.LDLCSDifMinStack) as LDLCSDifMinStack,
        AVG(m.LDLCSDifMeanStack) as LDLCSDifMeanStack 
    FROM sawshiftviatopad m 
    GROUP BY PN, lotnum, Layer, LDLMeasTime, DXDY, LDLMachine, FB, quad
) a
RIGHT JOIN (
    SELECT 
        m.PN, m.lotnum, m.Layer, m.LTHMeasTime, m.DXDY, m.LTHMachine, m.FB, m.quad,
        AVG(m.LTHCSDifMax) as LTHCSDifMax,
        AVG(m.LTHCSDifMin) as LTHCSDifMin,
        AVG(m.LTHCSDifMean) as LTHCSDifMean,
        AVG(m.LTHCSDifMaxStack) as LTHCSDifMaxStack,
        AVG(m.LTHCSDifMinStack) as LTHCSDifMinStack,
        AVG(m.LTHCSDifMeanStack) as LTHCSDifMeanStack
    FROM sawshiftpadtovia m 
    GROUP BY PN, lotnum, Layer, LTHMeasTime, DXDY, LTHMachine, FB, quad
) b ON a.lotnum = b.lotnum AND a.Layer = b.Layer AND a.DXDY = b.DXDY AND a.quad = b.quad 
WHERE a.LDLMeasTime BETWEEN '${timestampToYMDHIS(
      Number(st)
    )}' AND '${timestampToYMDHIS(Number(et))}'
  AND a.PN IS NOT NULL AND b.PN IS NOT NULL
GROUP BY 
    a.PN, a.lotnum, a.Layer, a.LDLMeasTime, a.DXDY, a.LDLMachine, a.FB, a.quad,
    b.LTHMeasTime, b.LTHMachine`;

    const results = await queryFunc(connection, sql);
    const res1 = removeDuplicateObjects(results);
    res.json(res1);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "处理请求时发生错误。" });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        console.log("关闭数据库连接时发生错误:", err);
      }
    }
  }
});

module.exports = router;