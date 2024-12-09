const express = require("express");
const mysql = require("mysql2");
const sql = require("mssql");
const fs = require("fs");
const { poolAcme, poolDc, poolNCN, poolSPC } = require("../mssql");
const { configFunc } = require("../config.js");
const { mysqlConnection, queryFunc } = require("../mysql.js");
const {
  timestampToYMDHIS,
  timestampToYMDHIS2,
  timestampToYMDHIS3,
} = require("../time.js");
const { connect } = require("http2");
const router = express.Router();

function getPreviousDate(numOfDays) {
  const date = new Date();
  date.setDate(date.getDate() - numOfDays);
  const day = date.toISOString().replace("T", " ").slice(0, 19);
  return `${day}`;
}
function splitArrayIntoThree(arr) {
  const len = arr.length;
  const partSize = Math.ceil(len / 3);
  const result = [];

  for (let i = 0; i < len; i += partSize) {
    result.push(arr.slice(i, i + partSize));
  }

  // 如果分割后的数组数量少于3（因为可能有数组长度不是3的倍数的情况），需要进行处理
  while (result.length < 3) {
    result.push([]);
  }

  return result;
}

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE");
  res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});
//深層複製Function
function deepCopy(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    let copy = [];
    for (let i = 0; i < obj.length; i++) {
      copy[i] = deepCopy(obj[i]);
    }
    return copy;
  }
  let copy = {};
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }
  return copy;
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


function removeDuplicates(data) {
  const uniqueMap = new Map();

  return data.filter(item => {
    const key = `${item.lotnum}-${item.Layer}-${item.DXDY}-${item.SN}`;
    
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, true);
      return true;
    }
    
    return false;
  });
}

router.get("/daily/:conut/:hour", (req, res) => {
  const { conut, hour } = req.params;
  mysqlConnection(configFunc("eis"))
    .then((connection) => {
      const time1 = new Date();
      console.log(time1);
      const sql = `SELECT * FROM ldl_stage where prg not like ('%UMGL%') and prg not like ('%system%')`; //要加時間區間
      //取得近兩個月過PTHIPQ的批號
      const curDate = new Date();
      const curDatesixty = new Date();
      const period = Number(conut);
      console.log(period);
      const t8sqlTime =
        curDate.toLocaleDateString() + " " + curDate.toTimeString().slice(0, 8);
      curDate.setDate(curDate.getDate() );
      curDatesixty.setDate(curDatesixty.getDate() - period);
      curDatesixty.setHours(Number(hour), 0, 0, 0);
      curDate.setHours(Number(hour) + 8, 0, 0, 0);
      // console.log("curDatesixty", curDatesixty);
      // console.log("curDate", curDate);
      const l8sqlTime = curDate.toISOString().replace("T", " ").slice(0, 19);
      const stsqlTime = curDatesixty
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
      console.log("stsqlTime", stsqlTime);
      console.log("l8sqlTime", l8sqlTime);
      console.log(
        "l8sqlTime",
        getPreviousDate(Number(conut) - 1),
        getPreviousDate(Number(conut))
      );
      const sqlCVI = `select distinct m.ChangeTime, m.lotnum from PDL_CKHistory(nolock) m inner join ClassIssType(nolock)t on m.isstype=t.ITypeCode where proccode in('PTH24') AND m.ChangeTime BETWEEN '${stsqlTime}' AND '${l8sqlTime}' and t.ITypeName not like ('%E3%') and AftStatus = 'CheckIn' and CancelTime is null
    `;
      return Promise.all([poolAcme.query(sqlCVI), queryFunc(connection, sql)]);
    })
    .then((result) => {
      // 設定從逾進抓下來的Lotnum陣列
      // res.json(result[0].recordset)
      const Lotrecord = [...new Set(result[0].recordset.map((i) => i.lotnum))];
      console.log("Lot Count", Lotrecord.length);
      let lotre = "";
      const pot = "'";
      Lotrecord.forEach((i) => {
        lotre = lotre + pot + i + pot + ",";
      });
      lotre = lotre + pot + pot;
      // 設定從MySQL抓下來的prg陣列，用於整理左右軸資訊
      ldl = [...new Set(result[1].filter((i) => lotre.includes(i.lot)))];
      const prgs = [...new Set(ldl.map((i) => i.prg))];
      //   console.log('123',prgs)
      // console.log(prgs)
      let prgtemp = "";
      //預設資料
      // console.log(lotre)
      lotre=pot+'248OE003-03-00'+ pot;
      prgs.forEach((i) => {
        prgtemp = prgtemp + pot + i.trim().split(".")[0] + pot + ",";
      });
      prgtemp = prgtemp + pot + pot;
      //   console.log('123',lotre)
      // res.json(lotre)
      const spcsql = `SELECT  
            b.filegroupname 站別,
            e.L51 PN,
            left(e.L52,14) lotnum,
            e.L81 Layer,
            e.L95 Pnl,
            e.MeasTime LDLMeasTime,
            f.MeasData LDLMeasData,
            d.ctrlname 管制項目,
            case when d.ctrlname Like '%DX%' then 'DX' ELSE 'DY' end as DXDY,
            case when Right( d.ctrlname, 1 ) = 'B' then 'S' ELSE 'C' end as Side,
            CASE WHEN e.L81 = '-Outer' THEN '-Outer'
            ELSE concat(Rtrim(CAST(((CAST(substring(e.L81,CHARINDEX('L',e.L81,4)+1,2) as int) - CAST(substring(e.L81,CHARINDEX('L',e.L81)+1,CHARINDEX('L',e.L81,4)-CHARINDEX('L',e.L81)-1) as int) + 1 )/2) as char)),'FB')
        END AS FB
            FROM Var_FileGroup a,var_filegroup b,Var_File c,var_ctrl d,Var_DataGroup e,Var_Data f
            WHERE b.fatherroot = a.filegroupid
            and b.filegroupid = c.filegroupid
            and c.fileid = d.fileid
            and e.CtrlID = d.ctrlid
            and f.DataGroupID = e.DataGroupID
            and b.FileGroupName in ('CY01LDL_外層雷鑽(LDL)', 'V3LDL_外層雷鑽(LDL)')
            and e.L52 in (${lotre})
            and d.ctrlname Like ('%Via To Pad D%')
            and d.ctrlname Not Like ('%Cavity%')
            and d.ctrlname Not Like ('%UV%')
            `;
      const spcsqlLTHDX = `
            SELECT  
            b.filegroupname 站別,
            e.L51 PN,
            left(e.L52,14) lotnum,
            e.L81 Layer,
            e.L95 Pnl,
            e.MeasTime LTHMeasTime,
            f.MeasData LTHMeasData,
            d.ctrlname 管制項目,
            case when d.ctrlname Like '%DX%' then 'DX' ELSE 'DY' end as DXDY,
            case when Right( d.ctrlname, 1 ) = 'B' then 'S' ELSE 'C' end as Side,
            CASE WHEN e.L81 = '-Outer' THEN '-Outer'
            ELSE concat(Rtrim(CAST(((CAST(substring(e.L81,CHARINDEX('L',e.L81,4)+1,2) as int) - CAST(substring(e.L81,CHARINDEX('L',e.L81)+1,CHARINDEX('L',e.L81,4)-CHARINDEX('L',e.L81)-1) as int) + 1 )/2) as char)),'FB')
        END AS FB
            FROM Var_FileGroup a,var_filegroup b,Var_File c,var_ctrl d,Var_DataGroup e,Var_Data f
            WHERE b.fatherroot = a.filegroupid
            and b.filegroupid = c.filegroupid
            and c.fileid = d.fileid
            and e.CtrlID = d.ctrlid
            and f.DataGroupID = e.DataGroupID
            and b.FileGroupName in ('CY01LTH_外層微影(LTH)', 'V3LTH_外層微影(LTH)')
            and e.L52 in (${lotre})
            and d.ctrlname Like ('%DX %')
            and d.ctrlname Not Like ('%Cavity%')
            and d.ctrlname Not Like ('%UV%')
            `;
      const spcsqlLTHDY = `
            SELECT  
            b.filegroupname 站別,
            e.L51 PN,
            left(e.L52,14) lotnum,
            e.L81 Layer,
            e.L95 Pnl,
            e.MeasTime LTHMeasTime,
            f.MeasData LTHMeasData,
            d.ctrlname 管制項目,
            case when d.ctrlname Like '%DX%' then 'DX' ELSE 'DY' end as DXDY,
            case when Right( d.ctrlname, 1 ) = 'B' then 'S' ELSE 'C' end as Side,
            CASE WHEN e.L81 = '-Outer' THEN '-Outer'
            ELSE concat(Rtrim(CAST(((CAST(substring(e.L81,CHARINDEX('L',e.L81,4)+1,2) as int) - CAST(substring(e.L81,CHARINDEX('L',e.L81)+1,CHARINDEX('L',e.L81,4)-CHARINDEX('L',e.L81)-1) as int) + 1 )/2) as char)),'FB')
        END AS FB
            FROM Var_FileGroup a,var_filegroup b,Var_File c,var_ctrl d,Var_DataGroup e,Var_Data f
            WHERE b.fatherroot = a.filegroupid
            and b.filegroupid = c.filegroupid
            and c.fileid = d.fileid
            and e.CtrlID = d.ctrlid
            and f.DataGroupID = e.DataGroupID
            and b.FileGroupName in ('CY01LTH_外層微影(LTH)', 'V3LTH_外層微影(LTH)')
            and e.L52 in (${lotre})
            and d.ctrlname Like ('%DY %')
            and d.ctrlname Not Like ('%Cavity%')
            and d.ctrlname Not Like ('%UV%')
            `;
      const LDLLTH = `select * from (SELECT left(m.partnum,7) PN, m.partnum + m.revision PN_, trim(m.lotnum) lotnum, c.ITypeName lottype, m.AftStatus, trim(l.LayerName) layer, left(p.ProcName,3) + CAST(m.BefDegree as char(1)) + right(p.ProcName,3) + CAST(m.AftTimes as char(1)) as step, m.Qnty, m.ChangeTime CheckinTime, mc.MachineName machine, Rank() over (partition by m.lotnum, l.LayerName, p.ProcName order by m.ChangeTime asc) Rank
            from PDL_CKHistory(nolock) m
            inner join NumofLayer(nolock) l on m.layer = l.Layer 
            inner join ProcBasic(nolock) p on m.proccode = p.ProcCode
            inner join PDL_Machine(nolock) mc on m.Machine = mc.MachineId
            inner join ClassIssType(nolock) c on m.isstype = c.ITypeCode
            where m.lotnum in (${lotre}) and AftStatus = 'CheckIn' and CancelTime is null and left(p.ProcName,3) + right(p.ProcName,3) in ('LDLCOL','LTHSEP')  ) dt 
            where Rank = 1 order by Checkintime desc`;
      const sqlldlstage = `
    SELECT distinct trim(l.LayerName) Layer,left(m.PARAMETER_DESC,1) Side ,m.PARAMETER_VALUE from Eng_OP(nolock) m
        inner join NumofLayer(nolock) l on m.layer = l.Layer 
        inner join ProcBasic(nolock) p on m.proccode = p.ProcCode
        where left(PartNum,4) not in ('UMGL') and PARAMETER_CODE in ('01_PROG_NAME_','02_PROG_NAME_') and (PARAMETER_DESC like '%C面%' or PARAMETER_DESC like '%S面%') and PARAMETER_VALUE in (${prgtemp})`;
      // console.log(sqlldlstage)
      // res.json(Lotrecord)
      // console.log(poolAcme)
      return Promise.all([
        poolSPC.query(spcsql),
        poolSPC.query(spcsqlLTHDX),
        poolSPC.query(spcsqlLTHDY),
        poolAcme.query(LDLLTH),
        poolAcme.query(sqlldlstage),
      ]);
    })
    .then((result) => {
      // Update 雷射左右軸層別資料
      let time1 = new Date();
      console.log("sql完成", time1);
      // res.json(result.recordset)

      const machinerecord = deepCopy(result[3].recordset);
      ldl.forEach((item, index, array) => {
        let llayer = result[4].recordset.filter((i) => {
          return item.prg.includes(i.PARAMETER_VALUE);
        })[0];
        item.Layer = llayer === undefined ? "" : llayer.Layer;
      });

      const SNconvertArray = [
        { bef: 1, aft: 6 },
        { bef: 2, aft: 5 },
        { bef: 3, aft: 8 },
        { bef: 4, aft: 7 },
        { bef: 5, aft: 2 },
        { bef: 6, aft: 1 },
        { bef: 7, aft: 4 },
        { bef: 8, aft: 3 },
        { bef: 9, aft: 14 },
        { bef: 10, aft: 13 },
        { bef: 11, aft: 16 },
        { bef: 12, aft: 15 },
        { bef: 13, aft: 10 },
        { bef: 14, aft: 9 },
        { bef: 15, aft: 12 },
        { bef: 16, aft: 11 },
      ];
      // res.json(result[0].recordset)
      // let snrecord=0;
      let snindex = 0;
      result[0].recordset.forEach((item, index, array) => {
        
        if (index !== 0) {
          if (
            item.lotnum === array[index - 1].lotnum &&
            item.Layer === array[index - 1].Layer &&
            item.DXDY === array[index - 1].DXDY
          ) {
            snindex = snindex + 1;
          } else {
            snindex = 0;
          }
        }

        item.SN = `${
          item.Side === "C"
            ? (snindex % 16) + 1 === 0
              ? 1
              : (snindex % 16) + 1
            : (snindex % 16) + 1 === 0
            ? 6
            : SNconvertArray[index % 16].aft
        }`;
        item.index = `${snindex + 1}`;
        item.Panel = `${
          (snindex % 32) + 1 >= 17
            ? item.Pnl.split(",").slice(1)
            : item.Pnl.split(",")[0]
        }`;
      });
      
      snindex = 0;
      result[1].recordset.forEach((item, index, array) => {
        if (index !== 0) {
          if (
            item.lotnum === array[index - 1].lotnum &&
            item.Layer === array[index - 1].Layer &&
            item.DXDY === array[index - 1].DXDY
          ) {
            snindex = snindex + 1;
          } else {
            snindex = 0;
          }
        }

        item.SN = `${
          item.Side === "C"
            ? (snindex % 16) + 1 === 0
              ? 1
              : (snindex % 16) + 1
            : (snindex % 16) + 1 === 0
            ? 6
            : SNconvertArray[index % 16].aft
        }`;
        item.index = `${snindex + 1}`;
        item.Panel = `${
          (snindex % 32) + 1 >= 17
            ? item.Pnl.split(",").slice(1)
            : item.Pnl.split(",")[0]
        }`;
      });
      snindex = 0;
      result[2].recordset.forEach((item, index, array) => {
        if (index !== 0) {
          if (
            item.lotnum === array[index - 1].lotnum &&
            item.Layer === array[index - 1].Layer &&
            item.DXDY === array[index - 1].DXDY
          ) {
            snindex = snindex + 1;
          } else {
            snindex = 0;
          }
        }

        item.SN = `${
          item.Side === "C"
            ? (snindex % 16) + 1 === 0
              ? 1
              : (snindex % 16) + 1
            : (snindex % 16) + 1 === 0
            ? 6
            : SNconvertArray[index % 16].aft
        }`;
        item.index = `${snindex + 1}`;
        item.Panel = `${
          (snindex % 32) + 1 >= 17
            ? item.Pnl.split(",").slice(1)
            : item.Pnl.split(",")[0]
        }`;
      });
      time1 = new Date();
      console.log("初步整理完成", time1);
      res.json(result[1].recordset)
      //定義FB陣列
      const FBArray = [
        "2FB",
        "3FB",
        "4FB",
        "5FB",
        "6FB",
        "7FB",
        "8FB",
        "9FB",
        "10FB",
        "11FB",
        "12FB",
      ];
      //定義曝光資料
      const LTHData = deepCopy([
        ...new Set(result[1].recordset.concat(result[2].recordset)),
      ]);
      
      //整理曝光資料C面S面結合，算出CS偏移量
      LTHData.forEach((item, index, array) => {
        const Csidecombinedata = LTHData.filter(
          (i) =>
            item.lotnum === i.lotnum &&
            item.Layer === i.Layer &&
            item.DXDY === i.DXDY &&
            i.Side === "C" &&
            item.SN === i.SN &&
            item.stage === i.stage &&
            item.Panel === i.Panel
        );
        //取出S面資料
        const Ssidecombinedata = LTHData.filter(
          (i) =>
            item.lotnum === i.lotnum &&
            item.Layer === i.Layer &&
            item.DXDY === i.DXDY &&
            i.Side === "S" &&
            item.SN === i.SN &&
            item.stage === i.stage &&
            item.Panel === i.Panel
        );
        LTHData[index].LTHMeasDataC =
          Csidecombinedata.length !== 0 ? Csidecombinedata[0].LTHMeasData : "";
        LTHData[index].LTHMeasDataS =
          Ssidecombinedata.length !== 0 ? Ssidecombinedata[0].LTHMeasData : "";
        LTHData[index].LTHCSDif =
          LTHData[index].LTHMeasDataC === ""
            ? ""
            : LTHData[index].DXDY === "DX"
            ? Number(LTHData[index].LTHMeasDataC) +
              Number(LTHData[index].LTHMeasDataS)
            : Number(LTHData[index].LTHMeasDataC) -
              Number(LTHData[index].LTHMeasDataS);
      });
      //算CS偏移量最大值、最小值、平均值
      LTHData.forEach((item, index, array) => {
        const Combinedata = LTHData.filter(
          (i) =>
            item.lotnum === i.lotnum &&
            item.Layer === i.Layer &&
            item.DXDY === i.DXDY &&
            item.SN === i.SN &&
            item.stage === i.stage
        );
        item.LTHCSDifMax = Math.max(...Combinedata.map((i) => i.LTHCSDif));
        item.LTHCSDifMin = Math.min(...Combinedata.map((i) => i.LTHCSDif));
        item.LTHCSDifMean =
          Combinedata.length > 0
            ? Number(
                Combinedata.reduce(
                  (sum, item) => (sum += Number(item.LTHCSDif)),
                  0
                )
              ) / Combinedata.length
            : "";
        delete item["站別"];
        delete item.Pnl;
        delete item["管制項目"];
        delete item.Side;
        delete item.index;
        delete item.Panel;
        // console.log(Combinedata, maxvalue, minvalue);
      });
      //算出疊加值
      let LTHDataTEMP = deepCopy([...new Set(LTHData)]);
      // console.log('type',typeof(LTHData))
      // console.log('type',typeof(LTHDataStack))
      // res.json(LTHDataStack)
      LTHDataTEMP.forEach((item, index, array) => {
        delete item.LTHMeasDataS;
        delete item.LTHMeasDataC;
        delete item.LTHMeasData;
        delete item.LTHCSDif;
      });

      let LTHDataStack = deepCopy([
        ...new Set(removeDuplicateObjects(LTHDataTEMP)),
      ]);
      // let LTHDataStack1 = deepCopy([
      //   ...new Set(removeDuplicateObjects(LTHDataTEMP)),
      // ]);
      //算出疊加值
      LTHDataStack.forEach((item, index, array) => {
        let FBTEMP = [];
        let FBindex = FBArray.indexOf(item.FB);
        //產生疊加用陣列
        FBArray.forEach((i, ind) => {
          if (ind <= FBindex || item.FB === "-Outer") {
            FBTEMP.push(i);
          }
        });
        if (item.FB === "-Outer") {
          FBTEMP.push("-Outer");
        }
        //
        const Combinedata = removeDuplicates(deepCopy([
          ...new Set(
            LTHDataStack.filter(
              (i) =>
                item.lotnum === i.lotnum &&
                item.DXDY === i.DXDY &&
                item.SN === i.SN &&
                item.stage === i.stage &&
                item.Panel === i.Panel &&
                FBTEMP.includes(i.FB)
            )
          ),
        ]));
        // if(Combinedata.length!==0){
        //   console.log('Combinedata',Combinedata[0].lotnum)
          if(Combinedata[0].lotnum==='248OE003-03-00'){
            console.log('Combinedata',Combinedata)
          }
        // }
        //Update Machine資料
        item.LTHMachine = deepCopy(
          [
            ...new Set(
              machinerecord.filter(
                (i) =>
                  item.lotnum === i.lotnum &&
                  item.Layer === i.layer &&
                  i.machine.includes("曝光")
              )
            ),
          ][0]
            ? [
                ...new Set(
                  machinerecord.filter(
                    (i) =>
                      item.lotnum === i.lotnum &&
                      item.Layer === i.layer &&
                      i.machine.includes("曝光")
                  )
                ),
              ][0].machine
            : ""
        );
        // res.json(Combinedata)
        // aaa
        // console.log(Combinedata)
        //算出LTH疊加值
        item.LTHCSDifMaxStack = Combinedata.reduce((sum, obj) => {
          return sum + obj.LTHCSDifMax;
        }, 0);
        item.LTHCSDifMinStack = Combinedata.reduce((sum, obj) => {
          return sum + obj.LTHCSDifMin;
        }, 0);
        item.LTHCSDifMeanStack = Combinedata.reduce((sum, obj) => {
          return sum + obj.LTHCSDifMean;
        }, 0);

        // console.log(FBTEMP, item.FB, Combinedata);
      });

      time1 = new Date();
      console.log("LTH整理完成", time1);
      // res.json(LTHDataStack);
      // aaa
      //定義雷射資料
      const LDLData = [...new Set(result[0].recordset)];

      //整理雷射資料C面S面結合，算出CS偏移量
      LDLData.forEach((item, index, array) => {
        const Csidecombinedata = LDLData.filter(
          (i) =>
            item.lotnum === i.lotnum &&
            item.Layer === i.Layer &&
            item.DXDY === i.DXDY &&
            i.Side === "C" &&
            item.SN === i.SN &&
            item.stage === i.stage &&
            item.Panel === i.Panel
        );
        //取出S面資料
        const Ssidecombinedata = LDLData.filter(
          (i) =>
            item.lotnum === i.lotnum &&
            item.Layer === i.Layer &&
            item.DXDY === i.DXDY &&
            i.Side === "S" &&
            item.SN === i.SN &&
            item.stage === i.stage &&
            item.Panel === i.Panel
        );

        LDLData[index].LDLMeasDataC =
          Csidecombinedata.length !== 0 ? Csidecombinedata[0].LDLMeasData : "";
        LDLData[index].LDLMeasDataS =
          Ssidecombinedata.length !== 0 ? Ssidecombinedata[0].LDLMeasData : "";
        LDLData[index].LDLCSDif =
          LDLData[index].LDLMeasDataC === ""
            ? ""
            : LDLData[index].DXDY === "DX"
            ? Number(LDLData[index].LDLMeasDataC) +
              Number(LDLData[index].LDLMeasDataS)
            : Number(LDLData[index].LDLMeasDataC) -
              Number(LDLData[index].LDLMeasDataS);
      });

      //Update左右軸資料
      let LDLDatastage = deepCopy([...new Set(LDLData)]);
      LDLDatastage.forEach((item, index, Array) => {
        item.stage =
          ldl.filter(
            (i) =>
              item.lotnum === i.lot &&
              Number(i.board) === Number(item.Panel) &&
              item.Layer === i.Layer
          )[0] === undefined
            ? ""
            : ldl.filter(
                (i) =>
                  item.lotnum === i.lot &&
                  Number(i.board) === Number(item.Panel) &&
                  item.Layer === i.Layer
              )[0].stage;
        //update機台資料
        item.LDLMachine =
          deepCopy(
            [
              ...new Set(
                machinerecord.filter(
                  (i) =>
                    item.lotnum === i.lotnum &&
                    item.Layer === i.layer &&
                    i.machine.includes("雷射")
                )
              ),
            ][0]
          ) === undefined
            ? ""
            : deepCopy(
                [
                  ...new Set(
                    machinerecord.filter(
                      (i) =>
                        item.lotnum === i.lotnum &&
                        item.Layer === i.layer &&
                        i.machine.includes("雷射")
                    )
                  ),
                ][0].machine
              );
        delete item["站別"];
        delete item["管制項目"];
        delete item.Side;
        delete item.index;
        delete item.LDLMeasDataC;
        delete item.LDLMeasDataS;
        delete item.LDLMeasData;
        delete item.Pnl;
      });
      LDLDatastage = deepCopy([
        ...new Set(removeDuplicateObjects(LDLDatastage)),
      ]);
      // res.json(LDLDatastage)
      // aaa

      //算CS偏移量最大值、最小值、平均值
      LDLData.forEach((item, index, array) => {
        const Combinedata = LDLData.filter(
          (i) =>
            item.lotnum === i.lotnum &&
            item.Layer === i.Layer &&
            item.DXDY === i.DXDY &&
            item.SN === i.SN &&
            item.stage === i.stage
        );
        // console.log(Combinedata);
        item.LDLCSDifMax = Math.max(...Combinedata.map((i) => i.LDLCSDif));
        item.LDLCSDifMin = Math.min(...Combinedata.map((i) => i.LDLCSDif));
        item.LDLCSDifMean =
          Combinedata.length > 0
            ? Number(
                Combinedata.reduce(
                  (sum, item) => (sum += Number(item.LDLCSDif)),
                  0
                )
              ) / Combinedata.length
            : "";
        delete item["站別"];
        delete item.Pnl;
        delete item["管制項目"];
        delete item.Side;
        delete item.index;
        delete item.Panel;
        // console.log(Combinedata, maxvalue, minvalue);
      });

      //算出疊加值
      let LDLDataTEMP = deepCopy([...new Set(LDLData)]);
      // console.log('type',typeof(LDLData))
      // console.log('type',typeof(LDLDataStack))
      // res.json(LDLDataStack)
      LDLDataTEMP.forEach((item, index, array) => {
        delete item.LDLMeasDataS;
        delete item.LDLMeasDataC;
        delete item.LDLMeasData;
        delete item.LDLCSDif;
      });

      let LDLDataStack = deepCopy([
        ...new Set(removeDuplicateObjects(LDLDataTEMP)),
      ]);
      // let LDLDataStack1 = deepCopy([
      //   ...new Set(removeDuplicateObjects(LDLDataTEMP)),
      // ]);
      //算出疊加值
      LDLDataStack.forEach((item, index, array) => {
        let FBTEMP = [];
        let FBindex = FBArray.indexOf(item.FB);
        //產生疊加用陣列
        FBArray.forEach((i, ind) => {
          if (ind <= FBindex || item.FB === "-Outer") {
            FBTEMP.push(i);
          }
        });
        if (item.FB === "-Outer") {
          FBTEMP.push("-Outer");
        }
        //
        const Combinedata = removeDuplicates(deepCopy([
          ...new Set(
            LDLDataStack.filter(
              (i) =>
                item.lotnum === i.lotnum &&
                item.DXDY === i.DXDY &&
                item.SN === i.SN &&
                item.stage === i.stage &&
                item.Panel === i.Panel &&
                FBTEMP.includes(i.FB)
            )
          ),
        ]));
        // console.log(Combinedata)
        // item.Combinedata = deepCopy([
        //   ...new Set(
        //     LDLDataStack1.filter(
        //       (i) =>
        //         item.lotnum === i.lotnum &&
        //         item.DXDY === i.DXDY &&
        //         item.SN === i.SN &&
        //         item.stage === i.stage &&
        //         item.Panel === i.Panel &&
        //         FBTEMP.includes(i.FB)
        //     )
        //   ),
        // ]);
        item.LDLMachine =
          deepCopy(
            [
              ...new Set(
                machinerecord.filter(
                  (i) =>
                    item.lotnum === i.lotnum &&
                    item.Layer === i.layer &&
                    i.machine.includes("雷射")
                )
              ),
            ][0]
          ) === undefined
            ? ""
            : deepCopy(
                [
                  ...new Set(
                    machinerecord.filter(
                      (i) =>
                        item.lotnum === i.lotnum &&
                        item.Layer === i.layer &&
                        i.machine.includes("雷射")
                    )
                  ),
                ][0].machine
              );
        item.LDLCSDifMaxStack = Combinedata.reduce((sum, obj) => {
          return sum + obj.LDLCSDifMax;
        }, 0);
        item.LDLCSDifMinStack = Combinedata.reduce((sum, obj) => {
          return sum + obj.LDLCSDifMin;
        }, 0);
        item.LDLCSDifMeanStack = Combinedata.reduce((sum, obj) => {
          return sum + obj.LDLCSDifMean;
        }, 0);

        // console.log(FBTEMP, item.FB, Combinedata);
      });
      LDLDataStack = removeDuplicateObjects(LDLDataStack);
      LTHDataStack = removeDuplicateObjects(LTHDataStack);
      time1 = new Date();
      console.log("LDL整理完成", time1);
      const time2 = new Date();
      console.log("完成", time2);
      res.json({
        LDLout: {
          data: LDLDataStack,
          db: "sawshift",
          table: "sawshiftviatopad",
          match: [
            
            "LDLMachine",
            "LDLCSDifMax",
            "LDLCSDifMin",
            "LDLCSDifMean",
            "LDLCSDifMaxStack",
            "LDLCSDifMinStack",
            "LDLCSDifMeanStack",
          ],
        },
        LDLSTGout: {
          data: LDLDatastage,
          db: "sawshift",
          table: "sawshiftvpstage",
          match: [ "LDLMachine", "LDLCSDif", "FB", "PN"],
        },
        LTHout: {
          data: LTHDataStack,
          db: "sawshift",
          table: "sawshiftpadtovia",
          match: [
            
            "LTHMachine",
            "LTHCSDifMax",
            "LTHCSDifMin",
            "LTHCSDifMean",
            "LTHCSDifMeanStack",
            "LTHCSDifMaxStack",
            "LTHCSDifMinStack",
          ],
        },
      });
    })

    .catch((err) => {
      console.log(err);
    });
});

router.get("/addquadvia", (req, res) => {
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT * ,DATE_FORMAT(LDLMeasTime, '%Y-%m-%d %H:%i:%s') as LDLMeasTime FROM sawshiftviatopad where quad is NULL`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      // res.json(results)
      const padtovia = deepCopy([...new Set(results)]);
      const quadarray = [
        { sn: "1", quad: "III" },
        { sn: "2", quad: "III" },
        { sn: "3", quad: "III" },
        { sn: "4", quad: "III" },
        { sn: "5", quad: "IV" },
        { sn: "6", quad: "IV" },
        { sn: "7", quad: "IV" },
        { sn: "8", quad: "IV" },
        { sn: "1", quad: "IV" },
        { sn: "9", quad: "II" },
        { sn: "10", quad: "II" },
        { sn: "11", quad: "II" },
        { sn: "12", quad: "II" },
        { sn: "13", quad: "I" },
        { sn: "14", quad: "I" },
        { sn: "15", quad: "I" },
        { sn: "16", quad: "I" },
      ];
      padtovia.forEach((item, index, array) => {
        item.quad = quadarray.filter((i) => {
          if (item.SN) {
          } else {
            console.log(i.sn, item.SN);
          }
          return i.sn === item.SN;
        })[0].quad;
      });
      const pddata = splitArrayIntoThree(padtovia);
      // res.json(pddata)
      res.json({
        LDLout: {
          data: padtovia,
          db: "sawshift",
          table: "sawshiftviatopad",
          match: [
            
            "LDLMachine",
            "LDLCSDifMax",
            "LDLCSDifMin",
            "LDLCSDifMean",
            "LDLCSDifMeanStack",
            "LDLCSDifMaxStack",
            "LDLCSDifMinStack",
            "quad",
          ],
        },
        
      });
    })
    .catch((err) => {
      console.log(err);
    });
});
router.get("/addquadpad", (req, res) => {
  mysqlConnection(configFunc("sawshift"))
    .then((connection) => {
      const sql = `SELECT * ,DATE_FORMAT(LTHMeasTime, '%Y-%m-%d %H:%i:%s') as LTHMeasTime  FROM sawshiftpadtovia where quad is NULL`;
      return queryFunc(connection, sql);
    })
    .then((results) => {
      // res.json(results)
      const padtovia = deepCopy([...new Set(results)]);
      const quadarray = [
        { sn: "1", quad: "III" },
        { sn: "2", quad: "III" },
        { sn: "3", quad: "III" },
        { sn: "4", quad: "III" },
        { sn: "5", quad: "IV" },
        { sn: "6", quad: "IV" },
        { sn: "7", quad: "IV" },
        { sn: "8", quad: "IV" },
        { sn: "1", quad: "IV" },
        { sn: "9", quad: "II" },
        { sn: "10", quad: "II" },
        { sn: "11", quad: "II" },
        { sn: "12", quad: "II" },
        { sn: "13", quad: "I" },
        { sn: "14", quad: "I" },
        { sn: "15", quad: "I" },
        { sn: "16", quad: "I" },
      ];
      padtovia.forEach((item, index, array) => {
        item.quad = quadarray.filter((i) => {
          if (item.SN) {
          } else {
            console.log(i.sn, item.SN);
          }
          return i.sn === item.SN;
        })[0].quad;
      });
      const pddata = splitArrayIntoThree(padtovia);
      // res.json(pddata)
      res.json({
        LDLout: {
          data: padtovia,
          db: "sawshift",
          table: "sawshiftpadtovia",
          match: [
            
            "LTHMachine",
            "LTHCSDifMax",
            "LTHCSDifMin",
            "LTHCSDifMean",
            "LTHCSDifMeanStack",
            "LTHCSDifMaxStack",
            "LTHCSDifMinStack",
            "quad",
          ],
        },
        // LDLout1: {
        //   data: pddata[1],
        //   db: "sawshift",
        //   table: "sawshiftviatopad",
        //   match: [
        //     "LDLMeasTime",
        //     "LDLMachine",
        //     "LDLCSDifMax",
        //     "LDLCSDifMin",
        //     "LDLCSDifMean",
        //     "LDLCSDifMeanStack",
        //     "LDLCSDifMaxStack",
        //     "LDLCSDifMinStack",
        //   ],
        // },
        // LDLout2: {
        //   data: pddata[2],
        //   db: "sawshift",
        //   table: "sawshiftviatopad",
        //   match: [
        //     "LDLMeasTime",
        //     "LDLMachine",
        //     "LDLCSDifMax",
        //     "LDLCSDifMin",
        //     "LDLCSDifMean",
        //     "LDLCSDifMeanStack",
        //     "LDLCSDifMaxStack",
        //     "LDLCSDifMinStack",

        //   ],
        // },
        // LDLout2: {
        //   data: pddata[3],
        //   db: "sawshift",
        //   table: "sawshiftviatopad",
        //   match: [
        //     "LDLMeasTime",
        //     "LDLMachine",
        //     "LDLCSDifMax",
        //     "LDLCSDifMin",
        //     "LDLCSDifMean",
        //     "LDLCSDifMeanStack",
        //     "LDLCSDifMaxStack",
        //     "LDLCSDifMinStack",

        //   ],
        // },
        // LDLout2: {
        //   data: pddata[4],
        //   db: "sawshift",
        //   table: "sawshiftviatopad",
        //   match: [
        //     "LDLMeasTime",
        //     "LDLMachine",
        //     "LDLCSDifMax",
        //     "LDLCSDifMin",
        //     "LDLCSDifMean",
        //     "LDLCSDifMeanStack",
        //     "LDLCSDifMaxStack",
        //     "LDLCSDifMinStack",

        //   ],
        // },
      });
    })
    .catch((err) => {
      console.log(err);
    });
});
module.exports = router;
