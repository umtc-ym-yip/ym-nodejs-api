const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS } = require('../time');
const { dailyAdd, gettoDB } = require('../daily/dailyFunc');
const { mysqlConnection, queryFunc } = require('../mysql');
const { poolAcme, poolDc, poolNCN } = require('../mssql');
const { configFunc } = require('../config');
const { validate } = require('node-cron');
const fs=require('fs')
const XLSX=require('xlsx')
const path = require('path');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});



router.get('/dailyadd', async (req, res) => {
    try {
        const curDate = new Date();
        curDate.setHours(8, 0, 0, 0+1);
        const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

        curDate.setDate(curDate.getDate() - 1);
        curDate.setHours(8, 0, 0, 0);
        const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

        const fvi59sql = `SELECT DISTINCT 
            b.ProdClass,
            p.partnum PartNum,
            p.lotnum,
            t.ITypeName LotType,
            convert(varchar, p.ChangeTime, 120)ChangeTime FROM PDL_CKhistory(nolock)p 
            INNER JOIN ClassIssType(nolock)t 
            ON p.isstype=t.ITypeCode
            INNER JOIN ProdBasic b
            ON Left(p.partnum,7)=Left(b.PartNum,7)
            WHERE 
            LEFT(p.partnum,1)!='U' 
            AND proccode IN ('FVI59') 
            AND BefStatus='CheckIn' 
            AND AftStatus='Checkout'
            AND IsCancel is null 
            AND ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'`;

        const fvi10sql = `SELECT DISTINCT 
            b.ProdClass,
            b.BodySize,
            p.partnum PartNum,
            p.revision Revision,
            p.lotnum,
            t.ITypeName LotType,
            convert(varchar, p.ChangeTime, 120)ChangeTime FROM PDL_CKhistory(nolock)p 
            INNER JOIN ClassIssType(nolock)t 
            ON p.isstype=t.ITypeCode
            INNER JOIN ProdBasic b
            ON Left(p.partnum,7)=Left(b.PartNum,7)
            WHERE 
            LEFT(p.partnum,1)!='U' 
            AND proccode IN ('FVI10') 
            AND BefStatus='CheckIn' 
            AND AftStatus='Checkout'
            AND IsCancel is null 
            AND ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'`;

        const [fvi59Result, fvi10Result] = await Promise.all([
            poolAcme.query(fvi59sql),
            poolAcme.query(fvi10sql)
        ]);

        const fvi59Readout = fvi59Result.recordset;
        const fvi10Readout = fvi10Result.recordset;
        // console.log('fvi10Readout', fvi10Readout)
        // res.json({ fvi10Readout })
        const fvi59lotStr = `'${fvi59Readout.map((i) => i.lotnum).join("','")}'`;

        let fvi10Data = [];
        for (const i of fvi10Readout) {
            //${i.PartNum.slice(0, 7)}_${i.BodySize.replace(' * ', 'X').replace(/\./g, "")}有辦法改成資料夾名稱包含partnumslice(0,7)嗎?
            
            const baseDir = '//10.22.60.20/bump/FVIWPG/Optiviz/';
            const partNumPrefix = i.PartNum.slice(0, 7);
            const matchingFolder = findMatchingFolder(baseDir, partNumPrefix);
            
            if (matchingFolder) {
                const path = `${matchingFolder}/${i.lotnum}0/UnitlevelReport`;
                console.log('path', path);
                
                if (fs.existsSync(path)) {
                    const files = fs.readdirSync(path);
                    const csvFiles = files.filter((f) => f.includes(`${i.PartNum}${i.Revision}-${i.lotnum}0.csv`));
                    if (csvFiles.length > 0) {
                        const workbook = XLSX.readFile(`${path}/${csvFiles[0]}`);
                        const excelData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                        fvi10Data = [...fvi10Data, ...excelData];
                    }
                }
            } else {
                console.log(`No matching folder found for PartNum: ${partNumPrefix}`);
            }
        }
        // res.json({ fvi10Data })
        // console.log('fvi10Data', fvi10Data)
        const fvi10lotData = [...new Set(fvi10Data.map((i) => {
            const [part, lot_l, lot_c, lot_e] = i.BatchName.split('-');
            return `${lot_l}-${lot_c}-${lot_e.slice(0, 2)}`;
        }))];

        let fvi10RawData = [];
        for (const lot of fvi10lotData) {
            const lotData = fvi10Data.filter((i) => {
                const [part, lot_l, lot_c, lot_e] = i.BatchName.split('-');
                return `${lot_l}-${lot_c}-${lot_e.slice(0, 2)}` === lot;
            });

            const twodUnique = [...new Set(lotData.map((i) => i['2D Barcode']))];

            const tidyLotData = [];
            for (const d of twodUnique) {
                const twodData = lotData.filter((i) => i['2D Barcode'] === d && i['Unit result'] !== 'NOREAD');
                if (twodData.length > 0) {
                    tidyLotData.push(twodData.slice(-1)[0]);
                }
            }

            const noreadData = lotData.filter((i) => i['Unit result'] === 'NOREAD');
            if (noreadData.length > 0) {
                noreadData[noreadData.length - 1]['Unit result'] = '2DID Fail';
                tidyLotData.push(noreadData[noreadData.length - 1]);
            }

            const idx = fvi10Readout.findIndex((w) => lot === w.lotnum);
            const { ProdClass, PartNum, lotnum, LotType, ChangeTime } = fvi10Readout[idx];
            const obj = {
                ProdClass: ProdClass === 'APD' ? 'OSAT' : ProdClass,
                PartNum: PartNum.slice(0, 7),
                LotNum: lotnum,
                LotType,
                ChangeTime,
                totalCount: tidyLotData.length,
                Remark: '',
                Yield: (tidyLotData.filter((i) => i['Unit result'] === 'Pass').length / tidyLotData.length).toFixed(4),
                '2DIDFail': (tidyLotData.filter((i) => i['Unit result'] === '2DID Fail').length / tidyLotData.length).toFixed(4),
                '2DMixedFail': (tidyLotData.filter((i) => i['Unit result'] === '2DMixed Fail').length / tidyLotData.length).toFixed(4),
                '3DFail': (tidyLotData.filter((i) => i['Unit result'] === '3D Fail').length / tidyLotData.length).toFixed(4)
            };
            fvi10RawData.push(obj);
        }
        // console.log('fvi10RawData', fvi10RawData)
        const sqlStr = `WITH dt as 
        (SELECT * FROM
        (SELECT  LEFT(PartNum,7)PN,LotNum,Unit_Decision,[2D_Barcode],ROW_NUMBER() OVER (PARTITION BY LotNum,[2D_Barcode] ORDER BY 
        CASE WHEN Unit_Result IN ('Pass','Surfacefail','Land2Dfail','Component2Dfail') THEN 0 ELSE 1 END ASC)Rank,
        CASE WHEN Unit_Result IN ('Pass','Surfacefail','Land2Dfail','Component2Dfail') THEN 'Pass' ELSE Unit_Result END Unit_Result 
        FROM YM_ULT_FVIWPG_LogRawdata WHERE LotNum in (${fvi59lotStr}))T
        WHERE Rank='1')

        SELECT DISTINCT LotNum,totalCount,Yield,
        CASE WHEN [2DMatrixfail] IS NULL THEN 0 ELSE [2DMatrixfail] END [2DMatrixfail],
        CASE WHEN Land3Dfail IS NULL THEN 0 ELSE Land3Dfail END Land3Dfail,
        CASE WHEN Invalidfail IS NULL THEN 0 ELSE Invalidfail END Invalidfail
        FROM 
        (SELECT T.LotNum,CASE WHEN Unit_Result='Pass' then 'Yield' else Unit_Result end Unit_Result
        ,totalCount,Round(Cast(Count as real)/Cast(totalCount as real),4)Rate 
        FROM 
        (SELECT LotNum,Unit_Result,Count(*)Count from dt GROUP BY LotNum,Unit_Result)T
        INNER JOIN (Select Lotnum,Count(*)totalCount from dt GROUP BY LotNum) M 
        ON T.LotNum=M.LotNum)t PIVOT (Max(Rate) FOR Unit_Result IN ([Yield],[2DMatrixfail],[Land3Dfail],[Invalidfail]))k`;

        const wpgResult = await poolDc.query(sqlStr);
        const wpgRawData = wpgResult.recordset;
        // res.json(wpgRawData)
        wpgRawData.forEach((i) => {
            const idx = fvi59Readout.findIndex((w) => i.LotNum === w.lotnum);
            if (idx !== -1) {
                const { ProdClass, PartNum, LotType, ChangeTime } = fvi59Readout[idx];
                i.ProdClass = ProdClass;
                i.PartNum = PartNum.slice(0, 7);
                i.LotType = LotType;
                i.ChangeTime = ChangeTime;
            } else {
                i.ProdClass = '';
                i.PartNum = '';
                i.LotType = '';
                i.ChangeTime = '';
            }
            i.Remark = '';
        });

        res.json({
            wpgreadout: { data: wpgRawData, db: 'wpg', table: 'wpgyield', match: ['totalCount', '2DMatrixfail', 'Land3Dfail', 'Invalidfail'] },
            fvi10readoit: { data: fvi10RawData, db: 'wpg', table: 'wpgyieldfvi10', match: ['totalCount', 'Yield', '2DIDFail', '2DMixedFail', '3DFail'] }
        });
    } catch (error) {
        console.error('Error in /dailyadd route:', error);
        res.status(500).json({ error: 'An error occurred while processing the request' });
    }
});

module.exports = router;

function findMatchingFolder(baseDir, partNumPrefix) {
  const folders = fs.readdirSync(baseDir);
  
  // 尋找包含 partNumPrefix 的資料夾
  const matchingFolder = folders.find(folder => folder.includes(partNumPrefix));
  
  return matchingFolder ? path.join(baseDir, matchingFolder) : null;
}
