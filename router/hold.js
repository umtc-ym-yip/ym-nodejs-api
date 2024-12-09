const express = require("express");
const mysql = require("mysql2");
const sql = require("mssql");
const { TYPES } = require("mssql");
const fs = require("fs");
const {
  poolAcme,
  poolDc,
  poolNCN,
  poolDchold,
  poolNCNTest,
} = require("../mssql");
const { configFunc } = require("../config.js");
const { mysqlConnection, queryFunc } = require("../mysql.js");
const {
  timestampToYMDHIS,
  timestampToYMDHIS2,
  timestampToYMDHIS3,
} = require("../time.js");
const { connect } = require("http2");
const router = express.Router();
//抓出Layer的Function
function sumNumbersInString(str) {
  // 使用正則表達式提取所有數字
  const numbers = str.match(/\d+/g);

  // 如果沒有找到數字，返回 0
  if (!numbers) return 0;

  // 將提取的數字字符串轉換為數字並相加
  return numbers.reduce((sum, num) => sum + parseInt(num), 0);
}

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

const lotData = {
  LotNum: "2368E001-01-00",
  Layer: 3,
  LineId: 55,
  StopLayer: 3,
  StopCode: "PSP2DSS1",
  StopLotRouteSerial: 13,
  Empid: "您的工號",
  Tel: "您的分機",
  ProcessEmpId: "處置人員工號",
  Empid_C: "執行單位識別碼",
};
//Sawshift Hold帳
router.get("/process", async (req, res) => {
  try {
    //

    // 硬編碼的 lotData
    const lotData = {
      LotNum: "2368E001-01-00",
      Layer: 3,
      LineId: 55,
      StopLayer: 3,
      StopCode: "PSP2DSS1",
      StopLotRouteSerial: 13,
      Empid: "EMP001",
      Tel: "1234567890",
      ProcessEmpId: "PEMP001",
      Empid_C: "CEMP001",
    };

    console.log("Using lotData:", lotData);

    // 生成 GUID
    const guidResult = await poolDchold
      .request()
      .query("SELECT NEWID() as guid");
    const guid = guidResult.recordset[0].guid;
    console.log("Generated GUID:", guid);

    // 準備插入查詢
    const insertQuery = `
            INSERT INTO acme.dbo.__SigleLotFutureHold 
            (PaperNo, item, IsType, LotNum, Layer, LineId, StopLayer, StopCode, StopLotRouteSerial, 
            SPaperNo, DPart, Empid, Tel, TIMEPOINT, TIMEINTERVAL, Notes, GUID, ProcessEmpId, 
            ProcessNote, HoldNote, StopStatus)
            VALUES 
            (@PaperNo, @item, @IsType, @LotNum, @Layer, @LineId, @StopLayer, @StopCode, @StopLotRouteSerial, 
            @SPaperNo, @DPart, @Empid, @Tel, @TIMEPOINT, @TIMEINTERVAL, @Notes, @GUID, @ProcessEmpId, 
            @ProcessNote, @HoldNote, @StopStatus)
        `;

    // 準備請求
    const request = poolDchold.request();

    // 綁定參數
    request.input("PaperNo", sql.NVarChar, "");
    request.input("item", sql.Int, 0);
    request.input("IsType", sql.Int, 0);
    request.input("LotNum", sql.NVarChar, lotData.LotNum);
    request.input("Layer", sql.Int, lotData.Layer);
    request.input("LineId", sql.Int, lotData.LineId);
    request.input("StopLayer", sql.Int, lotData.StopLayer);
    request.input("StopCode", sql.NVarChar, lotData.StopCode);
    request.input("StopLotRouteSerial", sql.Int, lotData.StopLotRouteSerial);
    request.input("SPaperNo", sql.NVarChar, "AUTO");
    request.input("DPart", sql.NVarChar, "AUTO");
    request.input("Empid", sql.NVarChar, lotData.Empid);
    request.input("Tel", sql.NVarChar, lotData.Tel);
    request.input("TIMEPOINT", sql.DateTime, new Date());
    request.input("TIMEINTERVAL", sql.Int, 0);
    request.input(
      "Notes",
      sql.NVarChar,
      "Queue time 超時系統自動 hold,請通知QC人員進行判斷及處置"
    );
    request.input("GUID", sql.UniqueIdentifier, guid);
    request.input("ProcessEmpId", sql.NVarChar, lotData.ProcessEmpId);
    request.input("ProcessNote", sql.NVarChar, "請通知QC人員進行判斷及處置");
    request.input("HoldNote", sql.NVarChar, "I.Over Q Time");
    request.input("StopStatus", sql.NVarChar, "Waiting");

    // 執行插入操作
    console.log("Executing insert query...");
    const insertResult = await request.query(insertQuery);
    console.log("Insert result:", insertResult);

    // 執行存儲過程
    console.log("Executing stored procedure...");
    const procResult = await poolAcme
      .request()
      .input("GUID", sql.UniqueIdentifier, guid)
      .input("Empid_C", sql.NVarChar, lotData.Empid_C)
      .execute("acme.dbo.PDL_SigleHoldLotFtrAdd");
    console.log("Stored procedure result:", procResult);

    res.json({
      message: "FH process completed successfully",
      guid: guid,
      lotData: lotData,
      insertResult: insertResult,
      procResult: procResult,
    });
  } catch (err) {
    console.error("Error in FH process:", err);
    res.status(500).json({
      error: "An error occurred during the FH process",
      details: err.message,
      stack: err.stack,
    });
  }
});
//NCN Function
async function createNCN(item, poolNCNTest,ldlmachinelist,lthmachinelist) {
  
  console.log(item.triggerlimit,item.triggervalue)
  const lthcontent=Math.abs(item.triggervalue)-Math.abs(item.triggerlimit)>10?lthmachinelist+"。":""
  const DXDYcontent=item.DXDY==='DY'?item.triggervalue>0?"偏移方向DY向上":"偏移方向DY向下":item.triggervalue>0?"偏移方向DX向右":"偏移方向DX向左"
  console.log("因此批在"+item.Layer+"被偵測出層偏風險"+"，"+ldlmachinelist+"。"+ lthcontent)
  try {
    const result = await poolNCNTest
      .request()
      .input("USERID", sql.NVarChar, "10446")
      .input("QCID", sql.NVarChar, "A2578")
      .input("OCAPNO", sql.VarChar(100), "YM-OCAP-LDL-01")
      .input("NCNFAB", sql.VarChar(20), "YM")
      .input("NCNDept", sql.VarChar(100), "YIP")
      .input("OPENID", sql.VarChar(100), "10446")
      .input("OPENNAME", sql.VarChar(100), "10446")
      .input("LotNum", sql.VarChar(100), item.lotnum)
      .input("Opendatetime", sql.DateTime, new Date(new Date().getTime() + 8 * 60 * 60 * 1000))
      .input("Area1", sql.VarChar(100), "PTH")
      .input("Area2", sql.VarChar(100), "IPQ")
      .input("Manchine", sql.VarChar(100), "LDLABLE201/Y1 ABL雷射_MC3W01")
      .input("OPID", sql.VarChar(100), "10446")
      .input("FoundTime", sql.VarChar(100), "4")
      .input("Defect_Qty", sql.VarChar(100), "0")
      .input("Sample_Qty", sql.VarChar(100), "0")
      .input("Defect_Unit", sql.VarChar(100), "0")
      .input("Failuremode", sql.VarChar, "PSP079")
      .input("Spec", sql.VarChar(100), String(item.triggerlimit))
      .input("Abnomal_value", sql.VarChar(100), String(item.triggervalue))
      .input("Problemdes", sql.VarChar, "因此批在"+item.Layer+"被偵測出層偏風險，"+DXDYcontent+"，"+ldlmachinelist+"。"+ lthcontent)
      .input("Machine_des", sql.VarChar(100), "")
      .input("Dispanel", sql.VarChar(100), "0")
      .input("dismp", sql.VarChar(10), "0")
      .input("disunit", sql.VarChar(100), "0")
      .input("disstrip", sql.VarChar(100), "0")
      .input("distotal", sql.VarChar(100), "0")
      .input("Dismaterial", sql.VarChar(100), "")
      .input("board", sql.VarChar(100), "Comp/Sold")
      .input("Defectway", sql.VarChar(100), "9")
      .input("NCN_LEVEL", sql.VarChar(100), "C")
      .input("Problemtyep", sql.VarChar(200), "層間偏移異常")
      .input("Pddescription", sql.VarChar, "請QC協助確認")
      .input("Flowstatus", sql.VarChar(100), "2")
      .input("MrbStatus", sql.VarChar(100), "Y")
      .input("Rootcause", sql.VarChar(100), "")
      .input("feno", sql.VarChar(100), "")
      .input("Material", sql.VarChar(100), "")
      .input("dtype", sql.VarChar(100), "")
      .input("dcount", sql.VarChar(100), "")
      .input("dfcode", sql.VarChar, "")
      .input("scraplevel", sql.VarChar(100), "3")
      .input("NCNType", sql.VarChar, "YIPFabDashBoard")
      .execute("Write_NCN_Detail");

    console.log("NCN結果", result);
    // if(item.lotnum==="2483L001-02-00"){
    //   console.log(開NCN)
    //   aaa
    // }
    return { success: true, result: result };
  } catch (err) {
    console.error("NCN創建失敗", err);
    throw err;
  }
}





//測試
router.get("/sawshiftdatapvvpdaily1/:st/:et", async (req, res) => {
  let connection;
  try {
    const { st, et } = req.params;
    connection = await mysqlConnection(configFunc("sawshift"));
    const time1 = new Date();
    console.log(time1);


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
      ---AND CancelTime IS NULL
    ORDER BY 
      m.ChangeTime
    `;

    const result = await poolAcme.query(sqlCVI);
    
    const Lotrecord = [...new Set(result.recordset.map((i) => i.lotnumlayer))];
    console.log("Lot Count", Lotrecord.length);

    const lotrec = Lotrecord.map((i) => `'${i}'`).join(",") + "''";
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
      AVG(ROUND(b.LTHCSDifMeanStack, 4)) as LTHCSDifMeanStack,
      ROUND(a.LDLCSDifMaxStack - AVG(ROUND(b.LTHCSDifMinStack, 4)), 4) as shiftmax,
      ROUND(a.LDLCSDifMinStack - AVG(ROUND(b.LTHCSDifMaxStack, 4)), 4) as shiftmin
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
  WHERE CONCAT(a.lotnum, a.Layer) IN (${lotrec})
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
      AVG(ROUND(b.LTHCSDifMeanStack, 4)) as LTHCSDifMeanStack,
      ROUND(a.LDLCSDifMaxStack - AVG(ROUND(b.LTHCSDifMinStack, 4)), 4) as shiftmax,
      ROUND(a.LDLCSDifMinStack - AVG(ROUND(b.LTHCSDifMaxStack, 4)), 4) as shiftmin
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
  WHERE CONCAT(b.lotnum, b.Layer) IN (${lotrec})
    AND a.PN IS NOT NULL AND b.PN IS NOT NULL
  GROUP BY 
      a.PN, a.lotnum, a.Layer, a.LDLMeasTime, a.DXDY, a.LDLMachine, a.FB, a.quad,
      b.LTHMeasTime, b.LTHMachine`;
    const results = await queryFunc(connection, sql);
    const res1 = removeDuplicateObjects(results);

    // res.json(res1);
    // sss

    //產生Trigger用資料，準備比對用
    const curDate = new Date(st);
    const curDatesixty = new Date(et);

    // 為 curDate 加一天
    curDate.setDate(curDate.getDate() - 1);

    // 為 curDatesixty 加一天
    curDatesixty.setDate(curDatesixty.getDate() + 1);
    const resultstri = await poolAcme.query(
      `select distinct left(m.partnum,7) partnum, o.ProdClass,
                n.NumOfLayer, n.CIP_proctype from PDL_CKHistory(nolock) m 
                inner join prodbasic n on m.partnum = n.PartNum 
                inner join prodbasic o on m.partnum=o.PartNum
                where proccode in('PTH24') and n.CIP_proctype not like ('%//%')
                order by left(m.partnum,7)`
    );

    let partno = resultstri.recordset.filter(
      (i) =>
        i.partnum.substr(0, 4) === "3273" || i.partnum.substr(0, 4) === "6111"
    );

    let partnofb = [];
    let ct = 0;

    partno.forEach(function (item) {
      let step = [];
      let tri = [];
      let fbcount = parseInt(item.NumOfLayer, 10) / 2;

      for (var iii = 2; iii < fbcount; iii++) {
        step.push({ FB: iii + "FB", tri: 25 + iii * 5 });
        //   tri.push(25 + iii * 5);
      }
      step.push({ FB: "-Outer", tri: 25 + iii * 5 });

      partnofb[ct] = {
        ProdClass: item.ProdClass,
        name: item.partnum,
        Step: step,
        //   trigger: tri,
      };
      ct += 1;
    });

    partnofb = removeDuplicateObjects([...new Set(partnofb)]);
    // res.json(partnofb)
    res1.forEach((item, index, array) => {
      const PNTEMP = partnofb.filter((i) => {
        return i.name === item.PN;
      })[0].Step;

      // console.log(item,PNTEMP.filter((i) => {
      //   return item.FB === i.FB;
      // })[0])
      const FBTEMP = PNTEMP.filter((i) => {
        return item.FB === i.FB;
      })[0].tri;

      item.triggerlimit = FBTEMP;
      item.Judge =
        Math.abs(Number(item.shiftmax)) > Number(FBTEMP) ||
        Math.abs(Number(item.shiftmin)) > Number(FBTEMP);
      // console.log(PNTEMP.length,PNTEMP[0].Step)
    });
    // res.json(res1)
    // aaas
    //篩選出Trigger Lot
    const triggerlot = res1.filter((i) => i.Judge === true);
    //取得機台能力
    const LDLMachineablitity = await queryFunc(
      connection,
      "SELECT PN, Layer, LDLMachine, FB, DXDY, COUNT(*) AS GroupCount, AVG(CASE WHEN stage = 'L' THEN LDLCSDif END) AS L_LDLCSDifMean, AVG(CASE WHEN stage = 'R' THEN LDLCSDif END) AS R_LDLCSDifMean FROM sawshiftvpstage GROUP BY PN, Layer, LDLMachine, FB, DXDY"
    );

    const LTHMachineablitity = await queryFunc(
      connection,
      "SELECT PN, Layer, LTHMachine, FB, DXDY, AVG(LTHCSDifMean) AS MeanLTHCSDifMean FROM sawshiftpadtovia GROUP BY PN, Layer, LTHMachine, FB,DXDY"
    );

    //從被Trigger的Lot，新增要Hold帳的機台
    if (triggerlot.length > 0) {
      triggerlot.forEach((item, index, array) => {
        //計算被Trigger的值
        item.triggervalue =
          Math.abs(Number(item.shiftmax)) > Math.abs(Number(item.shiftmin))
            ? Number(item.shiftmax)
            : Number(item.shiftmin);

        //判斷物料下一個層別
        const PNStep = partnofb.filter((i) => i.name === item.PN)[0].Step;
        let FB;
        PNStep.forEach((item1, ind, arr) => {
          
          if (item1.FB === item.FB && item.FB !== "-Outer") {
            FB = arr[ind + 1].FB;
            console.log(item.PN,FB)
            
            item.HoldLayer = LDLMachineablitity.concat(LTHMachineablitity).filter(
              (i) => item.PN === i.PN && FB === i.FB
            )[0].Layer;
          }
        });
        if (item.FB !== "-Outer") {
          //計算LDL被Hold帳的機台
          item.LDLholdmachine =
            item.triggervalue > 0
              ? LDLMachineablitity.filter(
                  (i) =>
                    item.PN === i.PN &&
                    FB === i.FB &&
                    item.DXDY === i.DXDY &&
                    i.L_LDLCSDifMean < 0 &&
                    i.R_LDLCSDifMean < 0
                ).sort(
                  (a, b) =>
                    a.L_LDLCSDifMean +
                    a.R_LDLCSDifMean -
                    b.L_LDLCSDifMean -
                    b.R_LDLCSDifMean
                )
              : LDLMachineablitity.filter(
                  (i) =>
                    item.PN === i.PN &&
                    FB === i.FB &&
                    item.DXDY === i.DXDY &&
                    i.L_LDLCSDifMean > 0 &&
                    i.R_LDLCSDifMean > 0
                ).sort(
                  (a, b) =>
                    -a.L_LDLCSDifMean -
                    a.R_LDLCSDifMean +
                    b.L_LDLCSDifMean +
                    b.R_LDLCSDifMean
                );
          //計算LTH被Hold帳的機台
          item.LTHholdmachine =
            item.triggervalue > 0
              ? LTHMachineablitity.filter(
                  (i) =>
                    item.PN === i.PN &&
                    FB === i.FB &&
                    item.DXDY === i.DXDY &&
                    i.MeanLTHCSDifMean < 0
                ).sort((a, b) => a.MeanLTHCSDifMean - b.MeanLTHCSDifMean)
              : LTHMachineablitity.filter(
                  (i) =>
                    item.PN === i.PN &&
                    FB === i.FB &&
                    item.DXDY === i.DXDY &&
                    i.MeanLTHCSDifMean > 0
                ).sort((a, b) => -a.MeanLTHCSDifMean + b.MeanLTHCSDifMean);
        } else {
          item.LTHholdmachine = [];
          item.LDLholdmachine = [];
        }
      });
      //
    }

  
    // res.json(LDLMachineablitity);
    //轉出層別對應代碼
    const Layercode = await poolAcme.query(
      `SELECT Layer ,Trim(LayerName) LayerName FROM NumofLayer`
    );
    // res.json(Layercode.recordsets[0])

    //找出物料目前層別

    const triggerLotlist = [...new Set(triggerlot.map((i) => i.lotnum))];
    let lotre = "";
    const pot = "'";
    triggerLotlist.forEach((i) => {
      lotre = lotre + pot + i + pot + ",";
    });
    lotre = lotre + pot + pot;

    const lotnewinfor = await poolAcme.query(
      `WITH RankedRecords AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY lotnum ORDER BY ChangeTime DESC) AS RowNum
        FROM PDL_CKHistory (NOLOCK)
        WHERE lotnum IN (${lotre})
      )
      SELECT *
      FROM RankedRecords
      WHERE RowNum = 1;`
    );

    // res.json(lotnewinfor.recordsets[0]);
    // aaa;
    //整理Hold帳資料
    let holddata = [];
    let holddatalth = [];
    for (const item of triggerlot) {
      const currentlot = lotnewinfor.recordsets[0].find(
        (i) => i.lotnum.slice(0, 14) === item.lotnum
      );
      let HoldLayer = "";
      let ldlmachinelist = "";
      let lthmachinelist = "";
      if (item.FB !== "-Outer") {
        HoldLayer = item.HoldLayer.replace(/\s+/g, "");
        if (item.LDLholdmachine.length > 0) {
          ldlmachinelist =
            ldlmachinelist + "請依照以下雷射機台機限生產:";
        } else {
          ldlmachinelist =
            ldlmachinelist +
            "但雷射沒有可機限機台，請與雷射製程工程師聯絡";
        }
        if (item.LTHholdmachine.length > 0) {
          lthmachinelist =
            lthmachinelist +
            "請依照以下曝光機台機限生產:";
        } else {
          lthmachinelist =
            lthmachinelist +
            "但曝光沒有可機限機台，請與曝光製程工程師聯絡";
        }

        item.LDLholdmachine.forEach((item1, ind, arr) => {
          let No = 1 + Number(ind);
          ldlmachinelist =
            ldlmachinelist + " " + No + ". " + item1.LDLMachine.split("_")[1];
          // HoldLayer = item1.Layer.replace(/\s+/g, "");
        });

        item.LTHholdmachine.forEach((item1, ind, arr) => {
          let No = 1 + Number(ind);
          lthmachinelist =
            lthmachinelist + " " + No + ". " + item1.LTHMachine;
          // HoldLayer = item1.Layer.replace(/\s+/g, "");
        });
        //
        console.log("HoldLayer", HoldLayer);
        if (
          Number(item.triggervalue) >
          Math.abs(Number(item.triggerlimit)) + 10
        ) {
          item.LTHholdmachine.forEach((item1, ind, arr) => {
            let No = 1 + Number(ind);
            lthmachinelist =
              lthmachinelist + " " + No + ". " + item1.LTHMachine;
            // HoldLayer = item1.Layer.replace(/\s+/g, "");
          });
          holddatalth.push({
            LotNum: item.lotnum,
            Layer: currentlot.layer,
            LineId: 55,
            StopLayer: Layercode.recordsets[0].find(
              (i) => HoldLayer === i.LayerName
            ).Layer,
            // StopLayer: currentlot.layer,
            StopCode: "LTH23",
            StopLotRouteSerial: 3,
            Empid: "EMP001",
            Tel: "1234567890",
            ProcessEmpId: "PEMP001",
            Empid_C: "CEMP001",
            ProcessNote: "因此批在"+item.Layer+"被偵測出層偏風險，"+lthmachinelist,
          });
        }

        holddata.push({
          LotNum: item.lotnum,
          Layer: currentlot.layer,
          LineId: 55,
          StopLayer: Layercode.recordsets[0].find(
            (i) => HoldLayer === i.LayerName
          ).Layer,
          // StopLayer: currentlot.layer,
          StopCode: "LDL01",
          StopLotRouteSerial: 3,
          Empid: "EMP001",
          Tel: "1234567890",
          ProcessEmpId: "PEMP001",
          Empid_C: "CEMP001",
          ProcessNote: "因此批在"+item.Layer+"被偵測出層偏風險，"+ldlmachinelist,
        });
        //NCN
        await createNCN(item, poolNCNTest,ldlmachinelist,lthmachinelist)
        // if(item.lotnum==="2483L001-02-00"){
        //   console.log(item)
        //   aaa
        // }
        //NCN 結束
      } else {
        await createNCN(item, poolNCNTest,ldlmachinelist,lthmachinelist)
      }
    };

    // res.json(triggerlot)
    // aaa
    holddata = removeDuplicateObjects(holddata);
    holddatalth = removeDuplicateObjects(holddatalth);
    holddata = holddata.concat(holddatalth);
    // res.json(holddatalth.concat(holddata));
    // aaa;

    const insertQuery = `
      INSERT INTO acme.dbo.__SigleLotFutureHold
      (PaperNo, item, IsType, LotNum, Layer, LineId, StopLayer, StopCode, StopLotRouteSerial,
      SPaperNo, DPart, Empid, Tel, TIMEPOINT, TIMEINTERVAL, Notes, GUID, ProcessEmpId,
      ProcessNote, HoldNote, StopStatus)
      VALUES
      (@PaperNo, @item, @IsType, @LotNum, @Layer, @LineId, @StopLayer, @StopCode, @StopLotRouteSerial,
      @SPaperNo, @DPart, @Empid, @Tel, @TIMEPOINT, @TIMEINTERVAL, @Notes, @GUID, @ProcessEmpId,
      @ProcessNote, @HoldNote, @StopStatus)
    `;

    // 為整批記錄生成一個 GUID
    const guidResult = await poolDchold
      .request()
      .query("SELECT NEWID() as guid");
    const batchGuid = guidResult.recordset[0].guid;
    console.log("生成的批次 GUID:", batchGuid);
    // Hold帳請求程式碼開始LDL
    const results1 = [];
    for (const holdRecord of holddata) {
      const request = poolDchold.request();

      try {
        // 使用 TYPES 對象或字符串來指定類型
        request.input("PaperNo", TYPES.NVarChar, "");
        request.input("item", TYPES.Int, 0);
        request.input("IsType", TYPES.Int, 0);
        request.input("LotNum", TYPES.NVarChar, holdRecord.LotNum);
        request.input("Layer", TYPES.Int, holdRecord.Layer);
        request.input("LineId", TYPES.Int, holdRecord.LineId);
        request.input("StopLayer", TYPES.Int, holdRecord.StopLayer);
        request.input("StopCode", TYPES.NVarChar, holdRecord.StopCode);
        request.input(
          "StopLotRouteSerial",
          TYPES.Int,
          holdRecord.StopLotRouteSerial
        );
        request.input("SPaperNo", TYPES.NVarChar, "AUTO");
        request.input("DPart", TYPES.NVarChar, "AUTO");
        request.input("Empid", TYPES.NVarChar, holdRecord.Empid);
        request.input("Tel", TYPES.NVarChar, holdRecord.Tel);
        request.input(
          "TIMEPOINT",
          TYPES.DateTime,
          new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
        );
        request.input("TIMEINTERVAL", TYPES.Int, 0);
        request.input("Notes", TYPES.NVarChar, holdRecord.ProcessNote);
        request.input("GUID", TYPES.UniqueIdentifier, batchGuid);
        request.input("ProcessEmpId", TYPES.NVarChar, holdRecord.ProcessEmpId);
        request.input("ProcessNote", TYPES.NVarChar, holdRecord.ProcessNote);
        request.input("HoldNote", TYPES.NVarChar, "I.Over Q Time");
        request.input("StopStatus", TYPES.NVarChar, "Waiting");
      } catch (inputError) {
        console.error("Error in input binding:", inputError);
      }
      const inputObject = {
        PaperNo: { type: TYPES.NVarChar, value: "" },
        item: { type: TYPES.Int, value: 0 },
        IsType: { type: TYPES.Int, value: 0 },
        LotNum: { type: TYPES.NVarChar, value: holdRecord.LotNum },
        Layer: { type: TYPES.Int, value: holdRecord.Layer },
        LineId: { type: TYPES.Int, value: holdRecord.LineId },
        StopLayer: { type: TYPES.Int, value: holdRecord.StopLayer },
        StopCode: { type: TYPES.NVarChar, value: holdRecord.StopCode },
        StopLotRouteSerial: {
          type: TYPES.Int,
          value: holdRecord.StopLotRouteSerial,
        },
        SPaperNo: { type: TYPES.NVarChar, value: "AUTO" },
        DPart: { type: TYPES.NVarChar, value: "AUTO" },
        Empid: { type: TYPES.NVarChar, value: holdRecord.Empid },
        Tel: { type: TYPES.NVarChar, value: holdRecord.Tel },
        TIMEPOINT: {
          type: TYPES.DateTime,
          value: new Date(new Date().getTime() + 8 * 60 * 60 * 1000),
        },
        TIMEINTERVAL: { type: TYPES.Int, value: 0 },
        Notes: { type: TYPES.NVarChar, value: holdRecord.ProcessNote },
        GUID: { type: TYPES.UniqueIdentifier, value: batchGuid },
        ProcessEmpId: { type: TYPES.NVarChar, value: holdRecord.ProcessEmpId },
        ProcessNote: { type: TYPES.NVarChar, value: holdRecord.ProcessNote },
        HoldNote: { type: TYPES.NVarChar, value: "I.Over Q Time" },
        StopStatus: { type: TYPES.NVarChar, value: "Waiting" },
      };
      console.log("輸入的資料", inputObject);

      console.log("正在執行插入查詢，LotNum:", holdRecord.LotNum);
      console.log("插入資料", holdRecord);
      const insertResult = await request.query(insertQuery);
      console.log("插入結果:", insertResult);

      let processedRecords = 0;
      let successfulRecords = 0;
      let failedRecords = 0;

      try {
        console.log("正在處理 LotNum:", holdRecord.LotNum);

        const request = poolDchold.request();

        request.input("GUID", TYPES.UniqueIdentifier, batchGuid);
        request.input("Empid_C", TYPES.NVarChar, holdRecord.Empid_C);

        console.log("正在執行存儲過程...");
        const procResult = await request.execute(
          "acme.dbo.PDL_SigleHoldLotFtrAdd"
        );

        console.log("存儲過程原始執行結果:", procResult);

        // 檢查存儲過程的返回值
        if (procResult.returnValue !== 0) {
          console.error("存儲過程返回非零值:", procResult.returnValue);
          failedRecords++;
          results1.push({
            LotNum: holdRecord.LotNum,
            status: "failed",
            returnValue: procResult.returnValue,
          });
        } else {
          successfulRecords++;
          results1.push({
            LotNum: holdRecord.LotNum,
            status: "success",
            returnValue: procResult.returnValue,
          });
        }

        // 檢查是否有返回的recordset
        if (procResult.recordsets && procResult.recordsets.length > 0) {
          console.log("存儲過程返回的記錄集:", procResult.recordsets);
        } else {
          console.log("存儲過程沒有返回記錄集");
        }

        // 檢查受影響的行數
        if (procResult.rowsAffected) {
          console.log("受影響的行數:", procResult.rowsAffected);
        }

        processedRecords++;
      } catch (procError) {
        console.error("執行存儲過程時出錯:", procError);
        console.error(
          "錯誤的 holdRecord:",
          JSON.stringify(holdRecord, null, 2)
        );
        failedRecords++;
        results1.push({
          LotNum: holdRecord.LotNum,
          status: "error",
          error: procError.message,
        });
      }
    }
    res.json(results1);
    // res.json(partnofb);
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

//NCN

router.get("/createncn", async (req, res) => {
  try {
    // let pool = await sql.connect(config);
    let result = await poolNCNTest
      .request()
      .input("USERID", sql.NVarChar, "10446")
      .input("QCID", sql.NVarChar, "A2578")
      .input("OCAPNO", sql.VarChar(100), "YM-OCAP-LDL-01")
      .input("NCNFAB", sql.VarChar(20), "YM")
      .input("NCNDept", sql.VarChar(100), "YIP")
      .input("OPENID", sql.VarChar(100), "10446")
      .input("OPENNAME", sql.VarChar(100), "10446")
      .input("LotNum", sql.VarChar(100), "2476E001-07-00")
      .input(
        "Opendatetime",
        sql.DateTime,
        new Date(new Date().getTime() + 8 * 60 * 60 * 1000)
      )
      .input("Area1", sql.VarChar(100), "PTH")
      .input("Area2", sql.VarChar(100), "IPQ")
      .input("Manchine", sql.VarChar(100), "LDLABLE201/Y1 ABL雷射_MC3W01")
      .input("OPID", sql.VarChar(100), "10446")
      .input("FoundTime", sql.VarChar(100), "4")
      .input("Defect_Qty", sql.VarChar(100), "0")
      .input("Sample_Qty", sql.VarChar(100), "0")
      .input("Defect_Unit", sql.VarChar(100), "0")
      .input("Failuremode", sql.VarChar, "PSP079") //OK
      .input("Spec", sql.VarChar(100), "75")
      .input("Abnomal_value", sql.VarChar(100), "82")
      .input(
        "Problemdes",
        sql.VarChar,
        "因此批被偵測出層偏風險，請依照以下雷射機台機限生產: 1. MC2F10 2. MC3F10 3. MC2F04 4. MC3F09 5. MC2F09 6. MC3F05 7. MC3F14 8. MC3F06 9. MC2F03"
      )
      .input("Machine_des", sql.VarChar(100), "")
      .input("Dispanel", sql.VarChar(100), "0")
      .input("dismp", sql.VarChar(10), "0")
      .input("disunit", sql.VarChar(100), "0")
      .input("disstrip", sql.VarChar(100), "0")
      .input("distotal", sql.VarChar(100), "0")
      .input("Dismaterial", sql.VarChar(100), "")
      .input("board", sql.VarChar(100), "Comp/Sold")
      .input("Defectway", sql.VarChar(100), "9")
      .input("NCN_LEVEL", sql.VarChar(100), "C")
      .input("Problemtyep", sql.VarChar(200), "層間偏移異常")
      .input("Pddescription", sql.VarChar, "請QC協助確認")
      .input("Flowstatus", sql.VarChar(100), "2")
      .input("MrbStatus", sql.VarChar(100), "Y")
      .input("Rootcause", sql.VarChar(100), "")
      .input("feno", sql.VarChar(100), "")
      .input("Material", sql.VarChar(100), "")
      .input("dtype", sql.VarChar(100), "")
      .input("dcount", sql.VarChar(100), "")
      .input("dfcode", sql.VarChar, "")
      .input("scraplevel", sql.VarChar(100), "3")
      .input("NCNType", sql.VarChar, "YIPFabDashBoard")
      .execute("Write_NCN_Detail");
    // const resultNCN = await callWriteNCNDetail(result);
    res.json({ success: true, result: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/test", async (req, res) => {
  try {
    // let pool = await sql.connect(config);
    const resultstri = await poolAcme.query(
      `select distinct left(m.partnum,7) partnum, o.ProdClass,
                n.NumOfLayer, n.CIP_proctype from PDL_CKHistory(nolock) m 
                inner join prodbasic n on m.partnum = n.PartNum 
                inner join prodbasic o on m.partnum=o.PartNum
                where proccode in('PTH24') and n.CIP_proctype not like ('%//%')
                order by left(m.partnum,7)`
    );
    const results = await poolAcme.query(
      `select distinct left(m.partnum,7) partnum, o.ProdClass,
                n.NumOfLayer, n.CIP_proctype from PDL_CKHistory(nolock) m 
                inner join prodbasic n on m.partnum = n.PartNum 
                inner join prodbasic o on m.partnum=o.PartNum
                where proccode in('PTH24') and n.CIP_proctype not like ('%//%')
                order by left(m.partnum,7)`
    );

    // const resultNCN = await callWriteNCNDetail(result);
    res.json(resultstri);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
module.exports = router;
