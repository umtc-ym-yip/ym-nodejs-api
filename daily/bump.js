const express = require("express");
const sql = require("mssql");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const {
  timestampToYMDHIS,
  timestampToYMDHIS2,
  timestampToYMDHIS3,
} = require("../time");

const { dailyAdd, gettoDB } = require("../daily/dailyFunc");
const { mysqlConnection, queryFunc } = require("../mysql");
const { poolAcme, poolDc, poolNCN, poolMetrology,poolMaterialYM } = require("../mssql");
const { configFunc } = require("../config");

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

router.get('/dailyadd/:date', async (req, res) => {
  try {
      const date = req.params.date;
      const curDate = new Date();
      curDate.setHours(8, 0, 0, 0);
      curDate.setDate(curDate.getDate() + 1-date);
      const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

      curDate.setDate(curDate.getDate() - date);
      curDate.setHours(8, 0, 0, 0);
      const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

      let readoutData = [];
      let lotArray = '';
      let lotStr = '';
      let topNumber = 5;

      const sql = `
      WITH Records AS(
          SELECT DISTINCT d.ProdClass,h1.partnum,lotnum,t.ITypeName lot_type, CONVERT(VARCHAR,ChangeTime,120)ChangeTime,SQnty_S + Qnty_S count_m, SQnty_S,
          ROW_NUMBER() OVER(PARTITION BY lotnum ORDER BY ChangeTime)AS rn
          FROM PDL_CKHistory(nolock)h1
          INNER JOIN ClassIssType(nolock)t
          ON h1.isstype=t.ITypeCode
          INNER JOIN prodbasic(nolock)d
          ON h1.partnum = d.Partnum AND h1.revision=d.Revision
          WHERE proccode IN ('FVI09','FVI60') 
          AND BefStatus IN ('CheckIn') 
          AND AftStatus IN ('CheckOut')
          AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'
      )
          SELECT * FROM Records r WHERE rn=1
          AND NOT EXISTS (
              SELECT top 1 * FROM PDL_CKHistory(nolock)h2 WHERE r.lotnum=h2.lotnum 
              AND proccode IN ('FVI09','FVI60') 
              AND BefStatus IN ('CheckIn') 
              AND AftStatus IN ('CheckOut')
              AND h2.ChangeTime<r.ChangeTime
          )`;

      const result = await poolAcme.query(sql);
      readoutData = result.recordset;

      lotArray = readoutData.map((i) => i.lotnum);
      lotStr = `'${lotArray.join("','")}'`;

      const sqlMac = `SELECT DISTINCT lotnum,proccode,MachineName, CONVERT(VARCHAR,ChangeTime,120)ChangeTime FROM PDL_CKHistory(nolock)h 
      INNER JOIN PDL_Machine(nolock) m
      ON h.Machine=m.MachineId
      WHERE 
      lotnum IN (${lotStr}) 
      AND h.proccode IN ('FVI09','FVI60')
      AND BefStatus='CheckIn'
      AND AftStatus='CheckOut'
      UNION
      SELECT DISTINCT lotnum,proccode,MachineName,CONVERT(VARCHAR,ChangeTime,120)ChangeTime FROM PDL_CKHistory(nolock)h 
      INNER JOIN PDL_Machine(nolock) m
      ON h.Machine=m.MachineId
      WHERE 
      lotnum IN (${lotStr}) 
      AND h.proccode IN ('FLI06','PSP22')
      AND BefStatus='MoveIn'
      AND AftStatus='CheckIn'
      `;

      const machineResult = await poolAcme.query(sqlMac);
      const machineData = machineResult.recordset;

      readoutData.forEach((r) => {
          const data = machineData.filter((m) => m.lotnum.trim() === r.lotnum);
          const processArray = ['PSP22', 'FVI60', 'FLI06', 'FVI09'];

          processArray.forEach((proccode) => {
              let process = '';
              if (proccode === 'PSP22' || proccode === 'FLI06') {
                  process = 'Uball'
              } else if (proccode === 'FVI60' || proccode === 'FVI09') {
                  process = 'CTV'
              }
              const processData = data.find((i) => i.proccode === proccode)

              if (processData === undefined) {
                  if (r[process] === undefined && r[`${process}_Time`] === undefined) {
                      r[process] = '';
                      r[`${process}_Time`] = '';
                  }
              } else {
                  r[process] = processData.MachineName;
                  r[`${process}_Time`] = processData.ChangeTime;
              }
          })
      });

      const fvi09Defect = ['missing feature', 'size X over limit', 'height over limit', 'size X under limit', 'height under limit', '2DID NG', 'has 3D error code', 'coplanarity regression over limit', 'has 2D error code'];
      const fvi60Defect = ['2DID NG',
          '3D / inspection error',
          '3D / Bad Bump',
          '3D / bump height ave.',
          '3D / Bump height hi',
          '3D / Bump height low',
          '3D / Jig Vacuum',
          '3D CirNG',
          '3D / CTV',
          '3D / Max. delta height',
          '3D / Min. delta height',
          '3D / Missing Bump',
          '3D / RCTV',
          '3D / RBTV',
          '3D / BTV',
          '3D / RBTV_CtB'
      ];
      const totalDefect = [...fvi09Defect, ...fvi60Defect]
      const totalDefectStr = `'${totalDefect.join("','")}'`;

      const defectSql = `SELECT 
      LEFT(PartNo,7)PartNo,
      LotNum,
      CASE WHEN Panel IS NULL THEN '' ELSE Panel END Panel,
      CASE WHEN Unit_X IS NULL THEN '' ELSE Unit_X END Unit_X,
      CASE WHEN Unit_Y IS NULL THEN '' ELSE Unit_Y END Unit_Y,
      Rank,
      CASE 
      WHEN t1.Defect IS NULL OR LEFT(t1.Defect,1)='J' OR t1.Defect = '2Dm / Invalid' THEN 'Pass'
      WHEN t1.Defect NOT IN (${totalDefectStr}) THEN 'Other' ELSE t1.Defect END Defect
      FROM 
      (SELECT *, row_number() over(partition by LotNum order by Inspection desc)Rank 
      FROM V_Bump_Unit_YM 
      WHERE Lotnum IN (${lotStr}) 
      AND Defect NOT IN ('Barcode failure', '2Dm / Invalid', 'J0', 'J16', 'J5', 'J12') 
      AND Unit_Y NOT IN ('RR')) t1`;
      const checkSql = `SELECT LotNum,Count(*)Count FROM V_Bump_Unit_YM GROUP BY LotNum`;

      const [defectResult, checkResult] = await Promise.all([
          poolMetrology.query(defectSql),
          poolMetrology.query(checkSql),
      ]);

      const defectData = defectResult.recordset;
      const checkData = checkResult.recordset;

      defectData.forEach((d) => {
          const index = readoutData.findIndex((f) => f.lotnum === d.LotNum);
          if (index !== -1) {
              d.Scrap = readoutData[index].SQnty_S
          } else {
              d.Scrap = 0
          }
      });

      const filterData = defectData.filter((d) => d.Rank <= d.Scrap);
      let defectSummary = [];

      readoutData.forEach((i) => {
          const check = checkData.filter((c) => c.LotNum === i.lotnum);

          if (check.length === 0) {
              i.isRemove = 1;
          } else {
              const data = filterData.filter((f) => f.LotNum === i.lotnum);
              i.Remark = '';
              i.isRemove = 0;
              i.Yield = (1 - i.SQnty_S / i.count_m).toFixed(4);

              const judgeArray = [...new Set(data.map((d) => d.Defect))];

              const judgeOrder = judgeArray.map(j => {
                  const count = data.filter((d) => d.Defect === j).length;
                  return {
                      PartNum: i.partnum,
                      LotNum: i.lotnum,
                      Defect: j,
                      Rate: Number((count / i.count_m).toFixed(4))
                  };
              });

              const judgeOrderSort = judgeOrder.sort((a, b) => b.Rate - a.Rate);
              defectSummary = [...defectSummary, ...judgeOrderSort];

              const top3Defect = judgeOrderSort.slice(0, topNumber);

              for (let index = 0; index < topNumber; index++) {
                  i[`Top${index + 1}`] = top3Defect[index]?.Defect ?? '';
                  i[`Top_${index + 1}`] = top3Defect[index]?.Rate ?? '';
              }
          }
      });

      const finalData = readoutData.filter((i) => i.isRemove !== 1);

      finalData.forEach((f) => {
          delete f.isRemove;
          delete f.rn;
      });
      const sqlMacMP=`Select distinct Left(b.AcmePart,7) PN, MpLtX, MpLtY 
                                  From YM_Layout_Center_Head a(nolock) left join YM_FilmPart_Map b(nolock) on b.FilmPart=a.JobName`
      const MPData=await poolDc.query(sqlMacMP);

      filterData.forEach((f) => {
          let lotnum = f.LotNum.slice(1)
          lotnum = lotnum.replace(/-/g, '');
          f.MPID=lotnum+f.Panel+"00"+determineQuadrant(f.Unit_X,f.Unit_Y,MPData.recordsets[0].filter(i=>i.PN===f.PartNo)[0].MpLtX,MPData.recordsets[0].filter(i=>i.PN===f.PartNo)[0].MpLtY)
          delete f.Scrap;
          delete f.Rank;
      });
      // res.json([{bumpmapv2:filterData}])
      res.json({
          bumpreadout: { data: finalData, db: 'bumpaoi', table: 'bumpyieldv2', match: ['ChangeTime', 'count_m', 'SQnty_S', 'Uball', 'Uball_Time', 'CTV', 'CTV_Time', 'Yield', 'Top1', 'Top_1', 'Top2', 'Top_2', 'Top3', 'Top_3'] },
          defectreadoit: { data: defectSummary, db: 'bumpaoi', table: 'bumpdefectv2', match: ['Rate'] },
          mappingreadout: { data: filterData, db: 'bumpaoi', table: 'bumpmapv2', match: ['Defect'] }
      });

  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'An error occurred while processing the request' });
  }
});


async function getTwoLevelFiles(dirPath, currentLevel = 0, partnum, lotNum, uballLine, RecipePartNum) {
  if (currentLevel > 2) return [];

  try {
    const files = await fs.readdir(dirPath);
    let allResults = []; // 修改為儲存所有結果的陣列

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      // if (!fullPath.includes("UBALL LOG\\UBALL")) continue;

      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        if (fullPath.includes(lotNum)) {
          console.log("找到lotNum", fullPath);
        }
        if (currentLevel < 1) {
          const result = await getTwoLevelFiles(
            fullPath,
            currentLevel + 1,
            partnum,
            lotNum,
            uballLine,
            RecipePartNum
          );
          if (result.length > 0) {
            allResults = allResults.concat(result); // 將結果合併到總陣列中
          }
        }
      } else {
        if (
          path.extname(file).toLowerCase() === ".csv" &&
          fullPath.includes("UBALL LOG\\UBALL") &&
          file.includes("List1") &&
          fullPath.includes(lotNum)
        ) {
          try {
            const content = await fs.readFile(fullPath, "utf8");
            const contentAry = content.split("\n").map((i) => i.split(","));
            let fileContentObj = [];
            console.log('RecipePartNum', RecipePartNum);

            contentAry.forEach((i, ind) => {
              if (ind > 4 && i.length > 4) {
                const baseObj = {
                  PartNum: partnum,
                  lotNum: lotNum,
                  UballLine: uballLine,
                  FileName: RecipePartNum.replace(/[\s()]/g, '_')
                };

                i.forEach((j, index) => {
                  if (index === 1) {
                    baseObj["MPID"] = j;
                    baseObj["Quad"] =
                      j.slice(-1) === "1"
                        ? "I"
                        : j.slice(-1) === "3"
                        ? "II"
                        : j.slice(-1) === "5"
                        ? "III"
                        : "IV";
                  } else if (i.length > 4) {
                    const columnName = contentAry[4][index].replace(/\./g, "_");
                    if (columnName) {
                      baseObj[columnName] = j;
                    }
                  }
                });

                baseObj["DateTime"] = baseObj["Date"] + " " + baseObj["Time"];
                fileContentObj.push(baseObj);
              }
            });

            if (fileContentObj.length > 0) {
              allResults = allResults.concat(fileContentObj); // 將當前檔案的結果加入總陣列
            }
          } catch (err) {
            console.error(`讀取檔案 ${fullPath} 時發生錯誤:`, err);
          }
        }
      }
    }

    return allResults; // 回傳所有找到的結果
  } catch (err) {
    console.error(`讀取目錄 ${dirPath} 時發生錯誤:`, err);
    return [];
  }
}

router.get("/bumpInLineadd/:date/:Hour", async (req, res) => {
  try {
    const date = req.params.date;
    const curDate = new Date();
    curDate.setHours(8, 0, 0, 0);
    curDate.setDate(curDate.getDate() - date);
    const t8sqlTime =
      curDate.toLocaleDateString() + " " + curDate.toTimeString().slice(0, 8);
    //顯示當前時間
    curDate.setDate(curDate.getDate() - 1);
    // curDate.setHours(8 + Number(req.params.Hour), 0, 0, 0);
    const l8sqlTime =
      curDate.toLocaleDateString() + " " + curDate.toTimeString().slice(0, 8);
    console.log(t8sqlTime, l8sqlTime);

    const sql = `SELECT distinct lotnum,left(partnum,7)partnum FROM PDL_CKHistory(nolock) WHERE ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}' AND Proccode IN ('PSP22') AND BefStatus='CheckIn' AND AftStatus='CheckOut'`;
    const result = await poolAcme.query(sql);
    let lotNumList=result.recordset.map(i=>i.lotnum.slice(0,14)).map(lot => `'${lot}'`).join(', ');
    console.log('lotNumList',lotNumList)
    
  // res.json(StencilList)
    

    // 定義網路共享路徑
    const networkPath = "\\\\10.22.60.20\\pe\\M6\\UBALL LOG";
    const [
      uball1Recipe,
      uball2Recipe,
      uball3Recipe,
      uball4Recipe,
      uball5Recipe,
    ] = await Promise.all([
      fs.readFile(
        "\\\\10.22.60.20\\pe\\M6\\UBALL LOG\\UBALL1\\IR\\RecipeName.csv",
        "utf8"
      ),
      fs.readFile(
        "\\\\10.22.60.20\\pe\\M6\\UBALL LOG\\UBALL2\\IR\\RecipeName.csv",
        "utf8"
      ),
      fs.readFile(
        "\\\\10.22.60.20\\pe\\M6\\UBALL LOG\\UBALL3\\IR\\RecipeName.csv",
        "utf8"
      ),
      fs.readFile(
        "\\\\10.22.60.20\\pe\\M6\\UBALL LOG\\UBALL4\\IR\\RecipeName.csv",
        "utf8"
      ),
      fs.readFile(
        "\\\\10.22.60.20\\pe\\M6\\UBALL LOG\\UBALL5\\IR\\RecipeName.csv",
        "utf8"
      ),
    ]);
    //轉成物件
    const uball1RecipeList = uball1Recipe.split("\n").map((i) => ({
      RecipePath:
        i.split(",")[0].length === 1
          ? "000" + i.split(",")[0]
          : i.split(",")[0].length === 2
          ? "00" + i.split(",")[0]
          : i.split(",")[0].length === 3
          ? "0" + i.split(",")[0]
          : i.split(",")[0],
      RecipePartNum: i.split(",")[1],
      
    }));
    const uball2RecipeList = uball2Recipe.split("\n").map((i) => ({
      RecipePath:
        i.split(",")[0].length === 1
          ? "000" + i.split(",")[0]
          : i.split(",")[0].length === 2
          ? "00" + i.split(",")[0]
          : i.split(",")[0].length === 3
          ? "0" + i.split(",")[0]
          : i.split(",")[0],
      RecipePartNum: i.split(",")[1],
    }));
    const uball3RecipeList = uball3Recipe.split("\n").map((i) => ({
      RecipePath:
        i.split(",")[0].length === 1
          ? "000" + i.split(",")[0]
          : i.split(",")[0].length === 2
          ? "00" + i.split(",")[0]
          : i.split(",")[0].length === 3
          ? "0" + i.split(",")[0]
          : i.split(",")[0],
      RecipePartNum: i.split(",")[1],
    }));
    const uball4RecipeList = uball4Recipe.split("\n").map((i) => ({
      RecipePath:
        i.split(",")[0].length === 1
          ? "000" + i.split(",")[0]
          : i.split(",")[0].length === 2
          ? "00" + i.split(",")[0]
          : i.split(",")[0].length === 3
          ? "0" + i.split(",")[0]
          : i.split(",")[0],
      RecipePartNum: i.split(",")[1],
    }));
    const uball5RecipeList = uball5Recipe.split("\n").map((i) => ({
      RecipePath:
        i.split(",")[0].length === 1
          ? "000" + i.split(",")[0]
          : i.split(",")[0].length === 2
          ? "00" + i.split(",")[0]
          : i.split(",")[0].length === 3
          ? "0" + i.split(",")[0]
          : i.split(",")[0],
      RecipePartNum: i.split(",")[1],
    }));
    // console.log('uball1RecipeList',uball1RecipeList)
    // res.json(uballRecipeList)
    let fileList = [];
    await Promise.all(
      result.recordset.map(async (item) => {
        // console.log("partnum", item.partnum, item.lotnum);
        //Test
        if(item.lotnum==="24AFE002-04-00") {
        

        const uball1Recipe = uball1RecipeList.filter((i) =>
          i.RecipePartNum === undefined
            ? false
            : i.RecipePartNum.includes(item.partnum)
        );
        const uball2Recipe = uball2RecipeList.filter((i) =>
          i.RecipePartNum === undefined
            ? false
            : i.RecipePartNum.includes(item.partnum)
        );
        const uball3Recipe = uball3RecipeList.filter((i) =>
          i.RecipePartNum === undefined
            ? false
            : i.RecipePartNum.includes(item.partnum)
        );
        const uball4Recipe = uball4RecipeList.filter((i) =>
          i.RecipePartNum === undefined
            ? false
            : i.RecipePartNum.includes(item.partnum)
        );
        const uball5Recipe = uball5RecipeList.filter((i) =>
          i.RecipePartNum === undefined
            ? false
            : i.RecipePartNum.includes(item.partnum)
        );
        console.log('uball2Recipe',uball2Recipe)
        if (uball1Recipe){
          for (let i = 0; i < uball1Recipe.length; i++) {
          if(checkPathExists(networkPath + "\\UBALL1\\IR\\" + uball1Recipe[i].RecipePath))
          {
          const files = await getTwoLevelFiles(
            networkPath + "\\UBALL1\\IR\\" + uball1Recipe[i].RecipePath,
            0,item.partnum,item.lotnum,"UBALL1",uball1Recipe[i].RecipePartNum
          );
          fileList = fileList.concat(files);
          const now = new Date();
          console.log(`現在時間uball1: ${now.toLocaleString()}`,item.partnum,item.lotnum);
          }
          }
        }  


        if (uball2Recipe){
          for (let i = 0; i < uball2Recipe.length; i++) {
          if(checkPathExists(networkPath + "\\UBALL2\\IR\\" + uball2Recipe[i].RecipePath))
          {
          const files = await getTwoLevelFiles(
            networkPath + "\\UBALL2\\IR\\" + uball2Recipe[i].RecipePath,
            0,item.partnum,item.lotnum,"UBALL2",uball2Recipe[i].RecipePartNum
          );
          console.log('files',networkPath + "\\UBALL2\\IR\\" + uball2Recipe[i].RecipePath,
            0,item.partnum,item.lotnum,"UBALL2",uball2Recipe[i].RecipePartNum)
          fileList = fileList.concat(files);
          const now = new Date();
          console.log(`現在時間uball2: ${now.toLocaleString()}`,item.partnum,item.lotnum);
          }
          }
        }  
        if (uball3Recipe){
          for (let i = 0; i < uball3Recipe.length; i++) {
          if(checkPathExists(networkPath + "\\UBALL3\\IR\\" + uball3Recipe[i].RecipePath))
          {
          const files = await getTwoLevelFiles(
            networkPath + "\\UBALL3\\IR\\" + uball3Recipe[i].RecipePath,
            0,item.partnum,item.lotnum,"UBALL3",uball3Recipe[i].RecipePartNum
          );
          fileList = fileList.concat(files);
          const now = new Date();
          console.log(`現在時間uball3: ${now.toLocaleString()}`,item.partnum,item.lotnum);
          }
          }
        }  
        if (uball4Recipe){
          for (let i = 0; i < uball4Recipe.length; i++) {
          if(checkPathExists(networkPath + "\\UBALL1\\IR\\" + uball4Recipe[i].RecipePath))
          {
          const files = await getTwoLevelFiles(
            networkPath + "\\UBALL4\\IR\\" + uball4Recipe[i].RecipePath,
            0,item.partnum,item.lotnum,"UBALL4",uball4Recipe[i].RecipePartNum
          );
          fileList = fileList.concat(files);
          const now = new Date();
          console.log(`現在時間uball4: ${now.toLocaleString()}`,item.partnum,item.lotnum);
          }
          }
        }  
        if (uball5Recipe){
          for (let i = 0; i < uball5Recipe.length; i++) {
          if(checkPathExists(networkPath + "\\UBALL5\\IR\\" + uball5Recipe[i].RecipePath))
          {
          const files = await getTwoLevelFiles(
            networkPath + "\\UBALL5\\IR\\" + uball5Recipe[i].RecipePath,
            0,item.partnum,item.lotnum,"UBALL5",uball5Recipe[i].RecipePartNum
          );
          fileList = fileList.concat(files);
          const now = new Date();
          console.log(`現在時間uball5: ${now.toLocaleString()}`,item.partnum,item.lotnum);
          }
          }
        }  
      }
    //test
  }
    
    )
    );
    const now = new Date();
    console.log(`現在時間完成: ${now.toLocaleString()}`);
    const Uball_list = [
      "PartNum",
      "lotNum",
      "UballLine",
      "MPID",
      "Quad",
      "PPM",
      "OK",
      "Failed",
      "NG",
      "NoBall",
      "Extra",
      "Shift",
      "Large",
      "Small",
      "B1_NoBall",
      "B1_Extra",
      "B1_Shift",
      "B1_Large",
      "B1_Small",
      "RETRY",
      "DateTime",
      "FileName",
    ];
    // 假設 fileList 是你要處理的物件陣列
    const filteredFileList = fileList.map((item) => {
      // 建立新物件只包含 Uball_list 中的屬性
      const filteredItem = {};

      Uball_list.forEach((key) => {
        // 如果該屬性存在於原始物件中，則保留
        if (key in item) {
          filteredItem[key] = item[key];
        }
      });

      return filteredItem;
    });
    // Update 鋼板資料
    const sqlStencil = `select *
			  from (select 
			  collection_item,
			  note,
			  left(note, 15) Stencil_Name,
			  substring(note, 21, 3) REV,
			  MachineID,
			  case MachineID
			  when 'SYM0120' then 'Y1 uBall_001'
			  when 'SYM0310' then 'Y1 uball_002'
			  when 'SYM0495' then 'Y1 uBall_003' else '' end as Machine,
			  last_edittime,
			  CompID,
			  case when left(right(CompID, 5), 1) in ('F') then Concat('2', left(CompID, 4), '0', substring(CompID, 5, 2), '-' , substring(CompID, 7, 2), '-00') else Concat('2', left(CompID, 7), '-', left(right(CompID,9), 2), '-',  left(right(CompID, 7), 2)) end as LotNum
			from PSPUBL_Stencil_HIST) a
				where a.LotNum in (${lotNumList}) and
					len(CompID) = 16`;
    const resultStencilList=await poolMaterialYM.query(sqlStencil);

    const sqlMPID2D=`SELECT distinct LotNum,MPID,Unit2DID from YM_ULT_UnitBase(nolock) where LotNum in (${lotNumList})`;
    const resultMPID2D=await poolDc.query(sqlMPID2D);
    // res.json(resultMPID2D)

    const StencilList=resultStencilList.recordsets;
    filteredFileList.forEach((item,index)=>{
      //如果item.MPID最後一個值是2、4、6、8，則最後一個值轉成1、3、5、7
      let lastDigit = parseInt(item.MPID.slice(-1));
      let newLastDigit;
      if (lastDigit % 2 === 0) {  // 如果是偶數
          newLastDigit = lastDigit - 1;  // 轉換成對應的奇數
          let MPID = item.MPID.slice(0, -1) + newLastDigit;//更新MPID
          // console.log('MPID',item.lotNum,item.MPID,MPID)
          item.MPID=MPID//更新MPID
          item.Quad=newLastDigit===1?"I":newLastDigit===3?"II":newLastDigit===5?"III":"IV"
          
      }
      let fluxStencilCheck=StencilList[0].find((i)=>i.LotNum===item.lotNum&&i.CompID===item.MPID&&i.collection_item==="Flux stencil")
      let uballStencilCheck=StencilList[0].find((i)=>i.LotNum===item.lotNum&&i.CompID===item.MPID&&i.collection_item==="Uball stencil")
      let MPID2D=resultMPID2D.recordsets[0].filter((i)=>i.MPID===item.MPID).map((i)=>i.Unit2DID)
      if(fluxStencilCheck){
        item.Flux_Stencil_ID=fluxStencilCheck.note
      }else{
        let fluxStencilCheck=StencilList[0].find((i)=>i.LotNum===item.lotNum&&MPID2D.includes(i.CompID)&&i.collection_item==="Flux stencil")
        item.Flux_Stencil_ID=fluxStencilCheck?fluxStencilCheck.note:""
        if(fluxStencilCheck){
          // console.log('2DID',item.lotNum,item.MPID,fluxStencilCheck.note)
        }
      }
      if(uballStencilCheck){
        item.Ball_Stencil_ID=uballStencilCheck.note
      }else{
        let uballStencilCheck=StencilList[0].find((i)=>i.LotNum===item.lotNum&&MPID2D.includes(i.CompID)&&i.collection_item==="Uball stencil")
        item.Ball_Stencil_ID=uballStencilCheck?uballStencilCheck.note:""
        if(uballStencilCheck){
          // console.log('2DID',item.lotNum,item.MPID,uballStencilCheck.note)
        }

      }
    })
    res.json({
      bumpinlineyielddata: {
        data: filteredFileList,
        db: "bumpaoi",
        table: "bumpinlineyieldv2",
        match: [
          "DateTime",
          "PPM",
          "OK",
          "Failed",
          "NG",
          "NoBall",
          "Extra",
          "Shift",
          "Large",
          "Small",
          "B1_NoBall",
          "B1_Extra",
          "B1_Shift",
          "B1_Large",
          "B1_Small",
          "Flux_Stencil_ID",
          "Ball_Stencil_ID",
        ],
      },
    });
    // res.json({
    //     totalFiles: fileList.length,
    //     files: fileList
    // });
  } catch (err) {
    console.error("處理請求時發生錯誤:", err);
    res.status(500).json({ error: "處理請求時發生錯誤" });
  }
});

function checkPathExists(path) {
  try {
    fsSync.accessSync(path);
    return true;
  } catch (error) {
    return false;
  }
}
function determineQuadrant(unitIdX, unitIdY, mpLtX, mpLtY) {
  if (Number(unitIdX) > mpLtX && Number(unitIdY) <= mpLtY) {
    return 1;
  } else if (Number(unitIdX) <= mpLtX && Number(unitIdY) <= mpLtY) {
    return 3;
  } else if (Number(unitIdX) <= mpLtX && Number(unitIdY) > mpLtY) {
    return 5;
  } else if (Number(unitIdX) > mpLtX && Number(unitIdY) > mpLtY) {
    return 7;
  } else {
    return 999;
  }
}


module.exports = router;
