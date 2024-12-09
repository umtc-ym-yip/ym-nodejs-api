const express = require("express");
const sql = require("mssql");
const { timestampToYMDHIS, timestampToYMDHIS2 } = require("../time");
const { dailyAdd, gettoDB } = require("../daily/dailyFunc");
const { mysqlConnection, queryFunc } = require("../mysql");
const { poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc } = require("../mssql");
const { configFunc } = require("../config");
const { validate } = require("node-cron");

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

router.get("/trenddata", (req, res) => {
  let trendData = [];
  let machineData = [];
  let prodclassData = [];

  // const defectAry = [
  //     'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A15', 'A16', 'A22', 'A23', 'A24', 'A41', 'A51', 'A61', 'A99',
  //     'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10', 'O41', 'O42', 'O43', 'O51', 'O52',
  //     'P2', 'P3', 'P9',
  //     'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10'
  // ];

  // const defectStr = `[${defectAry.join("],[")}]`;
  const ABFplusAry = [
    "ABFCLN",
    "ABFNOV",
    "ABFNCL",
    "ABFCPO",
    "ABFCZO",
    "ABFPOS",
    "ABFPTO",
    "ABFPVC",
    "ABFMEC",
    "ABFBZO",
    "ABFIPW",
    "ABFMPO",
    "ABFABF",
  ];
  const endTime = new Date();
  // endTime.setHours(8, 0, 0, 0);
  endTime.setDate(endTime.getDate() + 1);
  const t8sqlTime =
    endTime.toLocaleDateString() + " " + endTime.toTimeString().slice(0, 8);

  endTime.setDate(endTime.getDate() - 2);
  endTime.setHours(8, 0, 0, 0);
  const l8sqlTime =
    endTime.toLocaleDateString() + " " + endTime.toTimeString().slice(0, 8);

  const sqlaoiStr = `with 
    dt_defect as (Select Left(V.PartNum,7)PartNo,V.LotType,X.LotNum,V.Layer,V.LayerName,X.Side OutSide,X.BoardNo,X.Scrapped,X.Classify,X.VrsCode,X.Repair,X.UnitDefect,X.UnitDefect_AosBef,X.Qnty_S,X.ChangeTime from (SELECT L.LotNum,L.Layer,L.Side,L.BoardNo,L.Scrapped,L.Classify,L.VrsCode,L.Repair,L.UnitDefect,L.UnitDefect_AosBef,H.Qnty_S,H.ChangeTime from YM_VRS_Test_Result(nolock)L inner join 
    (Select * from (Select T.lotnum,T.layer,T.Qnty_S,T.proccode,A.aftproc,T.AftStatus,T.ChangeTime  from 
    (Select t.lotnum,t.layer,t.proccode,t.AftStatus,t.ChangeTime,j.Qnty_S from (SELECT h.lotnum,h.layer,proccode,AftStatus,ChangeTime from v_pdl_ckhistory(nolock) h where  (h.proccode ='AOI18' OR h.proccode ='AOI23') and h.BefStatus ='CheckIn' and h.AftStatus = 'CheckOut' and h.ChangeTime 
    between '${l8sqlTime}' and '${t8sqlTime}'
    Union
    SELECT h.lotnum,h.layer,proccode,AftStatus,ChangeTime from v_pdl_ckhistory(nolock) h where  h.proccode ='ABF27'  and ((h.BefStatus ='MoveOut' and h.AftStatus = 'MoveIn')OR(h.BefStatus ='MoveOut' and h.AftStatus = 'MoveOut')) and h.ChangeTime 
    between '${l8sqlTime}' and '${t8sqlTime}')t
    inner join (Select DISTINCT lotnum,layer,Qnty_S from v_pdl_ckhistory(nolock) where (proccode ='AOI04' OR proccode ='AOI24') and BefStatus ='MoveIn' and AftStatus = 'CheckIn')j on t.lotnum =j.lotnum and t.layer =j.layer) T  left join (SELECT lotnum,layer,proccode,aftproc,ChangeTime from v_pdl_ckhistory(nolock) h where (h.proccode ='AOI04' OR h.proccode ='AOI24') and h.BefStatus ='CheckOut' and h.AftStatus = 'MoveOut' ) A on T.lotnum=A.lotnum and T.layer=A.layer) U where U.proccode=U.aftproc)H on H.lotnum=L.LotNum and H.layer=L.Layer
    where  L.Classify !='0') X inner join YM_VRS_Step_Rec(nolock)V on X.LotNum=V.LotNum and X.Layer=V.Layer)
    
    
    SELECT PartNo,LotNum,RTRIM(LayerName)LayerName,Classify,Sum(Rate) Rate FROM 
    (SELECT C.PartNo,C.LotNum,C.LayerName,C.OutSide,C.Classify,Round(Count(In_Count)/Cast(Qnty_S As decimal),4) Rate FROM 
        (SELECT PartNo,LotNum,LayerName,BoardNo,OutSide,Classify,VrsCode,Qnty_S,count(*) In_Count FROM dt_defect 
        WHERE UnitDefect_AosBef='1'
        Group BY PartNo,LotNum,LayerName,BoardNo,OutSide,Classify,VrsCode,Outside,Qnty_S) C
        Group BY C.PartNo,C.LotNum,C.LayerName,C.OutSide,C.Classify,C.Qnty_S)T 
        Group BY PartNo,LotNum,LayerName,Classify`;

  // Select PartNo,LotType,T.LotNum,RTRIM(T.LayerName)LayerName,Bef_Yield,convert(varchar, ChangeTime, 120) ChangeTime,${defectStr} FROM

  // (Select PartNo,LotType,LotNum,LayerName,Round(1-(Count(*)/Cast(Qnty_S As real)),4) Bef_Yield,ChangeTime
  // FROM
  //     (Select PartNo,LotType,LotNum,LayerName,BoardNo,VrsCode,Qnty_S,count(*) In_Count,ChangeTime FROM dt_defect

  //     where UnitDefect_AosBef='1' Group by PartNo,LotType,LotNum,LayerName,BoardNo,VrsCode,Qnty_S,ChangeTime)Y
  //     Group by Y.PartNo,Y.LotType,Y.LotNum,Y.LayerName,Y.Qnty_S,Y.ChangeTime)T

  //     INNER JOIN

  //     (SELECT LotNum,LayerName,${defectStr} FROM
  //         (SELECT LotNum,LayerName,Classify,Sum(Defect_rate) Defect_rate FROM
  //             (SELECT C.LotNum,C.LayerName,C.OutSide,C.Classify,
  //                 Round(Count(In_Count)/Cast(Qnty_S As decimal),4) Defect_rate FROM

  // (SELECT LotNum,LayerName,BoardNo,OutSide,Classify,VrsCode,Qnty_S,count(*) In_Count
  // FROM dt_defect
  // WHERE UnitDefect_AosBef='1'
  // Group BY LotNum,LayerName,BoardNo,OutSide,Classify,VrsCode,Outside,Qnty_S) C
  // Group BY C.LotNum,C.LayerName,C.OutSide,C.Classify,C.Qnty_S)T
  // Group BY LotNum,LayerName,Classify)T
  // PIVOT (MAX([Defect_rate]) for Classify In (${defectStr}))p)P on  T.LotNum=P.LotNum and T.LayerName=P.LayerName

  const sqlprodclass = `SELECT DISTINCT Left(PartNum,7)PN,NumOfLayer,ProdClass FROM prodbasic`;

  Promise.all([poolDc.query(sqlaoiStr), poolAcme.query(sqlprodclass)])
    .then((resultAry) => {
      console.log();
      trendData = resultAry[0].recordset;
      prodclassData = resultAry[1].recordset;

      trendData.forEach((i) => {
        const idx = prodclassData.findIndex((d) => d.PN === i.PartNo);
        if (idx !== -1) {
          // i.NumOfLayer = prodclassData[idx].NumOfLayer;
          i.ProdClass =
            prodclassData[idx].ProdClass === null
              ? ""
              : prodclassData[idx].ProdClass;
          const NumOfLayer = prodclassData[idx].NumOfLayer;
          if (i.LayerName === "-Outer") {
            i.MatchLayer = NumOfLayer / 2;
          } else {
            const layerAry = i.LayerName.split("L"); ////-L5L6 ->['-','5','6']
            i.MatchLayer = (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2;
          }
        } else {
          // i.NumOfLayer = null;
          i.ProdClass = "";
          i.MatchLayer = "";
        }
      });
      // res.json(trendData);

      const lotStr = `'${[...new Set(trendData.map((i) => i.LotNum))].join(
        "','"
      )}'`;

      const sqlmachine = `SELECT DISTINCT LEFT(p.partnum,7)PartNo,RTRIM(lotnum)LotNum,RTRIM(LayerName)LayerName,t.ITypeName LotType,convert(varchar, ChangeTime, 120)ChangeTime,SUBSTRING(ProcName,1,3) ProcGroup,
            ProcName ProcNameS,MachineName,
            SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) ProcNameE,d.SerialNum
            FROM PDL_CKHistory(nolock)p 
            LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
            LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer 
            LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
            LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
            LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
            WHERE lotnum IN (${lotStr}) AND BefStatus='MoveIn' AND AftStatus='CheckIn' AND LEFT(p.partnum,4)<>'UMGL'`;
      return poolAcme.query(sqlmachine);
      // 要篩選掉超過Outer AOIVRS 的站點
      // LEFT JOIN V_PnumProcRouteDtl(nolock) d on PartNum,Revision p.proccode=d.ProcCode
    })
    .then((result) => {
      machineData = result.recordset;
      ///prodclassData
      machineData.forEach((i) => {
        ///判斷各站點 ProcNameS
        const idx = prodclassData.findIndex((d) => d.PN === i.PartNo);
        i.MachineName = i.MachineName === null ? "" : i.MachineName;
        i.SerialNum = i.SerialNum === null ? "" : i.SerialNum;

        if (ABFplusAry.includes(i.ProcNameS) && i.LayerName !== "-Outer") {
          ////ABF Outer 維持 反之+1
          const layerAry = i.LayerName.split("L");
          i.MatchLayer =
            (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2 + 1;
        } else if (i.LayerName === "-Outer") {
          if (idx !== -1) {
            const NumOfLayer =
              prodclassData[idx].NumOfLayer === null
                ? ""
                : prodclassData[idx].NumOfLayer;
            i.MatchLayer = NumOfLayer !== "" ? NumOfLayer / 2 : "";
          } else {
            i.MatchLayer = "";
          }
        } else {
          const layerAry = i.LayerName.split("L"); ////-L5L6 ->['-','5','6']
          i.MatchLayer = (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2;
        }
      });

      res.json({
        trend: {
          data: trendData,
          db: "paoi",
          table: "aoi_trend_rate",
          match: ["LotNum", "LayerName", "Classify"],
        },
        machine: {
          data: machineData,
          db: "paoi",
          table: "aoi_trend_machine",
          match: ["LotNum", "LayerName", "ProcNameE"],
        },
      });
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/dailyadd", (req, res) => {
  const endTime = new Date();
  endTime.setDate(endTime.getDate());
  endTime.setHours(8, 0, 0, 0);
  endTime.setDate(endTime.getDate() + 1);
  const t8sqlTime =
    endTime.toLocaleDateString() + " " + endTime.toTimeString().slice(0, 8);

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - 10);
  startTime.setHours(8, 0, 0, 0);
  const l8sqlTime =
    startTime.toLocaleDateString() + " " + startTime.toTimeString().slice(0, 8);

  const sqlStr = `SELECT 
    Left(V.PartNum,7)PartNo,
    V.LotType,
    RTRIM(X.LotNum)LotNum,
    RTRIM(V.Layer)Layer,
    RTRIM(V.LayerName)LayerName,
    X.Side OutSide,
    X.BoardNo,
    X.Scrapped,
    X.Classify,
    X.VrsCode,
    X.Repair,
    X.UnitDefect,
    X.UnitDefect_AosBef,
    X.Qnty_S,
    convert(varchar, X.ChangeTime, 120)ChangeTime,X.Location FROM 
    (SELECT L.LotNum,L.Layer,L.Side,L.BoardNo,L.Scrapped,L.Classify,L.VrsCode,L.Repair,L.UnitDefect,L.UnitDefect_AosBef,H.Qnty_S,H.ChangeTime,Location FROM YM_VRS_Test_Result(nolock)L 
    INNER JOIN 
    (SELECT * FROM (SELECT T.lotnum,T.layer,T.Qnty_S,T.proccode,A.aftproc,T.AftStatus,T.ChangeTime,T.Location FROM 
    (SELECT t.lotnum,t.layer,t.proccode,t.AftStatus,t.ChangeTime,j.Qnty_S,Location FROM 

    (SELECT h.lotnum,h.layer,proccode,AftStatus,ChangeTime,Location FROM v_pdl_ckhistory(nolock) h 

    WHERE 
    (h.proccode ='AOI18' OR h.proccode ='AOI23') 
    AND h.BefStatus ='CheckIn' 
    AND h.AftStatus = 'CheckOut' 
    AND h.ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'

        Union

    SELECT h.lotnum,h.layer,proccode,AftStatus,ChangeTime,Location FROM v_pdl_ckhistory(nolock) h

    where  
    h.proccode ='ABF27' 
    AND ((h.BefStatus ='MoveOut' and h.AftStatus = 'MoveIn') OR (h.BefStatus ='MoveOut' and h.AftStatus = 'MoveOut')) 
    AND h.ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}' 

    )
    t 
    INNER JOIN 
    (SELECT DISTINCT lotnum,layer,Qnty_S FROM v_pdl_ckhistory(nolock) 
    WHERE 
    (proccode ='AOI04' OR proccode ='AOI24') 
    AND BefStatus ='MoveIn' AND AftStatus = 'CheckIn')j 
    ON t.lotnum =j.lotnum AND t.layer =j.layer) T  
    LEFT JOIN 
    (SELECT lotnum,layer,proccode,aftproc,ChangeTime,Location FROM v_pdl_ckhistory(nolock) h 
    WHERE (h.proccode ='AOI04' OR h.proccode ='AOI24') AND h.BefStatus ='CheckOut' AND h.AftStatus = 'MoveOut' ) A 
    ON T.lotnum=A.lotnum AND T.layer=A.layer) U WHERE U.proccode=U.aftproc )H
    ON H.lotnum=L.LotNum AND H.layer=L.Layer WHERE L.Classify !='0') X
    INNER JOIN YM_VRS_Step_Rec(nolock)V
    ON X.LotNum=V.LotNum AND X.Layer=V.Layer`;

  //

  //

  const sqlTrigger = `SELECT *
    FROM YM_VRS_Yield_Gate(nolock)`;

  const sqlSf = `SELECT DISTINCT LEFT(PartNum,7) PN ,ULMark94V,NumOfLayer,ProdClass FROM
    prodbasic WHERE LEFT(PartNum,4)<>'UMGL' AND ULMark94V <>''`;

  Promise.all([
    poolDc.query(sqlStr),
    poolDc.query(sqlTrigger),
    poolAcme.query(sqlSf),
  ])
    .then((result) => {
      const rawData = result[0].recordset;

      const triggerData = result[1].recordset;
      const sfData = result[2].recordset;
      const summaryData = [];

      rawData.forEach((r) => {
        const layerAry = r.LayerName.split("L");
        const layerCheck = (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2;

        const sfIdx = sfData.findIndex((s) => r.PartNo === s.PN);
        const triIdx = triggerData.findIndex((t) => r.PartNo === t.ShortPart);

        if (sfIdx !== -1) {
          const { ULMark94V, NumOfLayer, ProdClass } = sfData[sfIdx];
          r.ULMark94V = ULMark94V;
          r.NumOfLayer = NumOfLayer;
          r.ProdClass = ProdClass;
          // r.sf_link = `http://10.22.66.28:8000/Core_Bu_VRS/PartLevel/${r.PartNo}_${r.ULMark94V.replace(/ /g, '%20')}/LotLevelLayer/${r.LotNum}_${r.LayerName === '-Outer' ? r.NumOfLayer / 2 : layerCheck}/`;
        } else {
          r.ULMark94V = "";
          r.NumOfLayer = "";
          r.ProdClass = "";
          // r.sf_link = '';
        }

        if (triIdx !== -1) {
          const { Core, Bu } = triggerData[triIdx];

          if (r.LayerName === "-Outer") {
            r.triger = Bu;
          } else {
            layerCheck === 1 ? (r.triger = Core) : (r.triger = Bu);
          }
        } else {
          r.triger = "";
        }
      });

      // 分批
      const lot_layer_qty = [
        ...new Set(
          rawData.map(
            (r) =>
              `${r.PartNo}~${r.LotNum}~${r.LayerName}~${r.Location}~${r.LotType}~${r.Qnty_S}~${r.ChangeTime}~${r.ProdClass}~${r.triger}`
          )
        ),
      ];

      lot_layer_qty.forEach((i) => {
        const [
          PartNo,
          LotNum,
          LayerName,
          Location,
          LotType,
          qty,
          ChangeTime,
          ProdClass,
          triger,
        ] = i.split("~");

        const locationCheck = Location.split("_")[1];
        const Obj = {};

        const filterData = rawData.filter(
          (r) =>
            r.LotNum === LotNum &&
            r.LayerName === LayerName &&
            r.Qnty_S === Number(qty)
        );

        const aosbefUnique = new Map();
        const aosaftUnique = new Map();

        filterData.forEach((f) => {
          const key = `${f.LotNum}${f.LayerName}${f.OutSide}${f.BoardNo}${f.VrsCode}`;

          if (f.UnitDefect_AosBef && !aosbefUnique.has(key)) {
            aosbefUnique.set(key, f);
          }
          if (f.UnitDefect && f.Scrapped !== 0 && !aosaftUnique.has(key)) {
            aosaftUnique.set(key, f);
          }
        });

        const aosbefData = Array.from(aosbefUnique.values());
        const aosaftData = Array.from(aosaftUnique.values());

        const classifyObj = {};

        aosbefData.forEach((d) => {
          if (d.OutSide === "C") {
            if (!classifyObj[`${d.Classify}-C`]) {
              classifyObj[`${d.Classify}-C`] = 1;
            } else {
              classifyObj[`${d.Classify}-C`] += 1;
            }
          } else {
            if (!classifyObj[`${d.Classify}-S`]) {
              classifyObj[`${d.Classify}-S`] = 1;
            } else {
              classifyObj[`${d.Classify}-S`] += 1;
            }
          }
        });

        const classifyAry = Object.keys(classifyObj);
        const classifysortAryC = [];
        const classifysortAryS = [];

        classifyAry.forEach((c) => {
          const [defect, side] = c.split("-");
          const Obj = {
            defect: c,
            count: classifyObj[c],
          };
          side === "C"
            ? classifysortAryC.push(Obj)
            : classifysortAryS.push(Obj);
        });

        const top3AryC = classifysortAryC
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        if (top3AryC.length < 3) {
          const count = top3AryC.length;
          for (let j = 0; j < 3 - count; j++) {
            top3AryC.push({ defect: "", count: 0 });
          }
        }

        const top3AryS = classifysortAryS
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        if (top3AryS.length < 3) {
          const count = top3AryS.length;
          for (let j = 0; j < 3 - count; j++) {
            top3AryS.push({ defect: "", count: 0 });
          }
        }

        top3AryC.forEach((t, idx) => {
          const [defect, side] = t.defect.split("-");

          Obj[`C_TOP_${idx + 1}`] = defect === undefined ? "" : defect;
          Obj[`C_TOP${idx + 1}`] =
            t.count === 0
              ? ""
              : `${((t.count / Number(qty)) * 100).toFixed(2)}%`;
        });

        top3AryS.forEach((t, idx) => {
          const [defect, side] = t.defect.split("-");
          Obj[`S_TOP_${idx + 1}`] = defect === undefined ? "" : defect;
          Obj[`S_TOP${idx + 1}`] =
            t.count === 0
              ? ""
              : `${((t.count / Number(qty)) * 100).toFixed(2)}%`;
        });

        const uniqueAosBefCount = [
          ...new Set(aosbefData.map((d) => d.BoardNo + d.VrsCode)),
        ].length; ///要排除C/S都有->算為一顆
        const uniqueAosAftCount = [
          ...new Set(aosaftData.map((d) => d.BoardNo + d.VrsCode)),
        ].length;

        Obj.Bef_Yield = (1 - uniqueAosBefCount / Number(qty)).toFixed(4);
        Obj.Yield = (1 - uniqueAosAftCount / Number(qty)).toFixed(4);
        Obj.Remark = `${LotNum.trim()}_${LayerName}`;
        Obj.PartNo = PartNo;
        Obj.LotType = LotType;
        Obj.LotNum = LotNum.trim();
        Obj.OldLotNum = LotNum.trim();
        Obj.Factory = locationCheck === "SN" ? "SN" : "YM";
        Obj.Layer = LayerName;
        Obj.AOILayer = LayerName;
        Obj.Time = timestampToYMDHIS(ChangeTime);
        Obj.ProdClass = ProdClass;
        // Obj.sf_link = sf_link;
        Obj.triger = triger;
        Obj.value = "";
        summaryData.push(Obj);
      });

      res.json({
        daily: {
          data: summaryData,
          db: "paoi",
          table: "ptaoi_yield_defect",
          // match: ['LotNum', 'Layer']
          match: [
            "OldLotNum",
            "Layer",
            "Yield",
            "Bef_Yield",
            "C_TOP_1",
            "C_TOP1",
            "C_TOP_2",
            "C_TOP2",
            "C_TOP_3",
            "C_TOP3",
            "S_TOP_1",
            "S_TOP1",
            "S_TOP_2",
            "S_TOP2",
            "S_TOP_3",
            "S_TOP3",
          ],
        },
      });
    })
    .catch((err) => {
      console.log(err);
    });
});

router.get("/sndailyadd", (req, res) => {
  const endTime = new Date();
  endTime.setDate(endTime.getDate()+10);
  endTime.setHours(8, 0, 0, 0);
  const t8sqlTime =
    endTime.toLocaleDateString() + " " + endTime.toTimeString().slice(0, 8);

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - 10);
  startTime.setHours(8, 0, 0, 0);
  const l8sqlTime =
    startTime.toLocaleDateString() + " " + startTime.toTimeString().slice(0, 8);

  let ymlotArray = [];
  let snlotArray = [];
  let ymlotStr = "";
  let snlotStr = "";
  let ymlotCheck = [];
  // YM逾進找所有代工物料 CHG11    MoveIn  O_SN_LTH_00

  //
  const sqlym = `SELECT DISTINCT partnum,lotnum,n.LayerName,proccode,AftStatus,ITypeName Lot_type FROM PDL_CKHistory h
    INNER JOIN NumofLayer(nolock)n ON h.Layer=n.Layer
    INNER JOIN ClassIssType(nolock)t ON h.isstype=t.ITypeCode
    WHERE proccode='CHG11' 
    AND AftStatus='MoveIn' 
    AND location LIKE '%SN%' 
    AND LEFT(partnum,4)<>'UMGL'`;
  // AND isstype<>'10'
  poolAcme
    .query(sqlym)
    .then((result) => {
      // 這些YM批號在SN逾進的狀況
      // 先到PDL_IssueDtl轉換
      ymlotCheck = result.recordset.map((i) => ({
        OldLotNum: i.lotnum.trim(),
        LayerName: i.LayerName.trim(),
        Lot_type: i.Lot_type,
      }));

      ymlotArray = [...new Set(result.recordset.map((i) => i.lotnum.trim()))];
      ymlotStr = `'${ymlotArray.join("','")}'`;

      const sqlissueDtl = `SELECT DISTINCT OldLotNum,LotNum
            FROM PDL_IssueDtl 
            WHERE OldLotNum IN (${ymlotStr})
            AND ProcCode='PLS07' 
            AND IsCancel='0'`;

      return poolSNAcme.query(sqlissueDtl);
    })
    .then((result) => {
      snlotArray = [...new Set(result.recordset.map((i) => i.LotNum.trim()))];

      // 寫入所有YM對應的SN批
      ymlotCheck.forEach((i, idx) => {
        ///{OldLotNum:...,LayerName:...}

        const index = result.recordset.findIndex(
          (r) => r.OldLotNum.trim() === i.OldLotNum.trim()
        );

        if (index !== -1) {
          i.LotNum = result.recordset[index].LotNum.trim();
        } else {
          i.LotNum = "";
        }
      });

      snlotStr = `'${snlotArray.join("','")}'`;

      //時間區間中Readout
      const snaoi = `
            SELECT partnum,lotnum,CONVERT(varchar,ChangeTime, 120)ChangeTime FROM PDL_CKhistory 
            WHERE proccode='AOI04' 
            AND AftStatus='CheckOut'
            AND lotnum IN (${snlotStr})
            AND ChangeTime BETWEEN '${timestampToYMDHIS2(new Date(l8sqlTime))}' 
            AND '${timestampToYMDHIS2(new Date(t8sqlTime))}'`;
      return poolSNAcme.query(snaoi);
    })
    .then((result) => {
      // 到SN_VRS_test_result_new算良率等等
      const readoutData = result.recordset;
      const readoutLot = `'${[
        ...new Set(readoutData.map((i) => i.lotnum.trim())),
      ].join("','")}'`;
      const snvrs = `SELECT 
            Left(V.PartNum,7)PartNo,
            V.LotType,
            X.LotNum,
            V.Layer,
            RTRIM(V.LayerName)LayerName,
            V.LayerType,
            Side OutSide,
            X.BoardNo,
            X.Scrapped,
            X.Classify,
            X.VrsCode,
            X.Repair,
            X.UnitDefect,
            X.UnitDefect_AosBef,
            H.MpLtX*H.MpLtY*2 Qnty_S,
            CONVERT(varchar,C.ChangeTime, 120)ChangeTime
            FROM SN_VRS_test_result_new(nolock)X 
            INNER JOIN SN_VRS_step_rec_new(nolock)V
            ON X.LotNum=V.LotNum AND X.Layer=V.Layer
            INNER JOIN YM_Layout_Center_Head(nolock)H
            ON X.CenterPart = H.JobName
            INNER JOIN w
            (
            SELECT DISTINCT lotnum,layer,Qnty_S,ChangeTime FROM v_pdl_ckhistory(nolock) WHERE 
            proccode ='AOI04'
            AND BefStatus ='MoveIn' 
            AND AftStatus = 'CheckIn'
            )J 
            ON X.LotNum =J.lotnum AND X.layer =J.layer
            INNER JOIN
            (
                SELECT DISTINCT lotnum,layer,Qnty_S,ChangeTime FROM v_pdl_ckhistory(nolock) WHERE 
                proccode ='AOI04'
                AND AftStatus = 'CheckOut'
            )C 
                ON X.LotNum =C.lotnum AND X.layer =C.layer
            
                
            WHERE X.LotNum IN (${readoutLot}) 
            AND X.Classify !='0'`;

      const sqlTrigger = `SELECT *
            FROM YM_VRS_Yield_Gate(nolock)`;

      const sqlSf = `SELECT DISTINCT LEFT(PartNum,7) PN ,ULMark94V,NumOfLayer,ProdClass FROM
            prodbasic WHERE LEFT(PartNum,4)<>'UMGL' AND ULMark94V <>''`;

      return Promise.all([
        poolSNDc.query(snvrs),
        poolDc.query(sqlTrigger),
        poolAcme.query(sqlSf),
      ]);
    })

    .then((result) => {
      const rawData = result[0].recordset;

      const triggerData = result[1].recordset;
      const sfData = result[2].recordset;
      const summaryData = [];

      rawData.forEach((r) => {
        const layerAry = r.LayerName.split("L");
        const layerCheck = (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2;

        const sfIdx = sfData.findIndex((s) => r.PartNo === s.PN);
        const triIdx = triggerData.findIndex((t) => r.PartNo === t.ShortPart);

        if (sfIdx !== -1) {
          const { ULMark94V, NumOfLayer, ProdClass } = sfData[sfIdx];
          r.ULMark94V = ULMark94V;
          r.NumOfLayer = NumOfLayer;
          r.ProdClass = ProdClass;
          // r.sf_link = `http://10.22.66.28:8000/Core_Bu_VRS/PartLevel/${r.PartNo}_${r.ULMark94V.replace(/ /g, '%20')}/LotLevelLayer/${r.LotNum}_${r.LayerName === '-Outer' ? r.NumOfLayer / 2 : layerCheck}/`;
        } else {
          r.ULMark94V = "";
          r.NumOfLayer = "";
          r.ProdClass = "";
          // r.sf_link = '';
        }

        if (triIdx !== -1) {
          const { Core, Bu } = triggerData[triIdx];

          if (r.LayerName === "-Outer" && r.LayerType !== "CORE") {
            r.triger = Bu;
          } else {
            if (r.LayerType === "CORE") {
              r.triger = Core;
            } else {
              layerCheck === 1 ? (r.triger = Core) : (r.triger = Bu);
            }
          }
        } else {
          r.triger = "";
        }
      });

      const lot_layer_qty = [
        ...new Set(
          rawData.map(
            (r) =>
              `${r.PartNo}~${r.LotNum}~${r.LayerName}~${r.LayerType}~${r.LotType}~${r.Qnty_S}~${r.ChangeTime}~${r.ProdClass}~${r.triger}`
          )
        ),
      ];
      lot_layer_qty.forEach((i) => {
        const [
          PartNo,
          LotNum,
          LayerName,
          LayerType,
          LotType,
          qty,
          ChangeTime,
          ProdClass,
          triger,
        ] = i.split("~");

        const Obj = {};

        const filterData = rawData.filter(
          (r) =>
            r.LotNum === LotNum &&
            r.LayerName === LayerName &&
            r.Qnty_S === Number(qty)
        );

        const aosbefUnique = new Map();
        const aosaftUnique = new Map();

        filterData.forEach((f) => {
          const key = `${f.LotNum}${f.LayerName}${f.OutSide}${f.BoardNo}${f.VrsCode}`;

          if (f.UnitDefect_AosBef && !aosbefUnique.has(key)) {
            aosbefUnique.set(key, f);
          }
          if (f.UnitDefect && f.Scrapped !== 0 && !aosaftUnique.has(key)) {
            aosaftUnique.set(key, f);
          }
        });

        const aosbefData = Array.from(aosbefUnique.values());
        const aosaftData = Array.from(aosaftUnique.values());

        const classifyObj = {};

        aosbefData.forEach((d) => {
          if (d.OutSide === "C") {
            if (!classifyObj[`${d.Classify}-C`]) {
              classifyObj[`${d.Classify}-C`] = 1;
            } else {
              classifyObj[`${d.Classify}-C`] += 1;
            }
          } else {
            if (!classifyObj[`${d.Classify}-S`]) {
              classifyObj[`${d.Classify}-S`] = 1;
            } else {
              classifyObj[`${d.Classify}-S`] += 1;
            }
          }
        });

        const classifyAry = Object.keys(classifyObj);
        const classifysortAryC = [];
        const classifysortAryS = [];

        classifyAry.forEach((c) => {
          const [defect, side] = c.split("-");
          const Obj = {
            defect: c,
            count: classifyObj[c],
          };
          side === "C"
            ? classifysortAryC.push(Obj)
            : classifysortAryS.push(Obj);
        });

        const top3AryC = classifysortAryC
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        if (top3AryC.length < 3) {
          const count = top3AryC.length;
          for (let j = 0; j < 3 - count; j++) {
            top3AryC.push({ defect: "", count: 0 });
          }
        }

        const top3AryS = classifysortAryS
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        if (top3AryS.length < 3) {
          const count = top3AryS.length;
          for (let j = 0; j < 3 - count; j++) {
            top3AryS.push({ defect: "", count: 0 });
          }
        }

        top3AryC.forEach((t, idx) => {
          const [defect, side] = t.defect.split("-");

          Obj[`C_TOP_${idx + 1}`] = defect === undefined ? "" : defect;
          Obj[`C_TOP${idx + 1}`] =
            t.count === 0
              ? ""
              : `${((t.count / Number(qty)) * 100).toFixed(2)}%`;
        });

        top3AryS.forEach((t, idx) => {
          const [defect, side] = t.defect.split("-");
          Obj[`S_TOP_${idx + 1}`] = defect === undefined ? "" : defect;
          Obj[`S_TOP${idx + 1}`] =
            t.count === 0
              ? ""
              : `${((t.count / Number(qty)) * 100).toFixed(2)}%`;
        });

        const uniqueAosBefCount = [
          ...new Set(aosbefData.map((d) => d.BoardNo + d.VrsCode)),
        ].length; ///要排除C/S都有->算為一顆
        const uniqueAosAftCount = [
          ...new Set(aosaftData.map((d) => d.BoardNo + d.VrsCode)),
        ].length;

        // LayerCheck
        let checkCoreLayer = "";

        if (LayerType === "CORE") {
          const index = ymlotCheck.findIndex((c) => {
            ////LotNum
            const layerArray = c.LayerName.split("L");
            return (
              c.LotNum === LotNum &&
              (layerArray[2] - layerArray[1] + 1) / 2 === 1
            );
          });

          if (index !== -1) {
            checkCoreLayer = ymlotCheck[index].LayerName;
          }
        }
        const { OldLotNum, Lot_type } = ymlotCheck.filter(
          (c) => c.LotNum === LotNum
        )[0];
        Obj.Bef_Yield = (1 - uniqueAosBefCount / Number(qty)).toFixed(4);
        Obj.Yield = (1 - uniqueAosAftCount / Number(qty)).toFixed(4);
        Obj.Remark = `${LotNum}_${
          LayerType === "CORE" ? checkCoreLayer : LayerName
        }`;
        Obj.PartNo = PartNo;
        Obj.LotType = LotType;
        Obj.LotNum = LotNum;
        Obj.OldLotNum = OldLotNum;
        Obj.LotType = Lot_type;
        Obj.Layer = `${LayerType === "CORE" ? checkCoreLayer : LayerName}`; ///r.LayerType==='CORE' 到YM Check 去抓層別
        Obj.AOILayer = LayerName;
        Obj.Time = timestampToYMDHIS(ChangeTime);
        Obj.ProdClass = ProdClass;
        Obj.Factory = "SN";
        // Obj.sf_link = sf_link;
        Obj.triger = triger;
        Obj.value = "";
        summaryData.push(Obj);
      });

      res.json({
        daily: {
          data: summaryData,
          db: "paoi",
          table: "ptaoi_yield_defect",
          match: [
            "Yield",
            "Bef_Yield",
            "C_TOP_1",
            "C_TOP1",
            "C_TOP_2",
            "C_TOP2",
            "C_TOP_3",
            "C_TOP3",
            "S_TOP_1",
            "S_TOP1",
            "S_TOP_2",
            "S_TOP2",
            "S_TOP_3",
            "S_TOP3",
          ],
        },
      });
    })
    .catch((err) => {
      console.log(err);
    });
});

module.exports = router;
