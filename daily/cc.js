const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS } = require('../time');
const { poolAcme, poolDc, poolNCN } = require('../mssql');
const { mysqlConnection, queryFunc } = require('../mysql');
const { configFunc } = require('../config.js');
const Client = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const csvToJson = require('csvtojson');
const os = require('os');
const csv = require('csv-parser');
const { Transform } = require('stream');

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});


router.get('/dailyadd', (req, res) => {

    const curDate = new Date()
    curDate.setDate(curDate.getDate() + 1);
    //curDate.setHours(8, 0, 0, 0);
    const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    curDate.setDate(curDate.getDate() - 30);
    curDate.setHours(8, 0, 0, 0);
    const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    let CCLot = [];

    poolAcme.query(`SELECT DISTINCT ULMark94V,ProdClass type,Left(m.partnum,7)partno,lotnum lotno,t.ITypeName lot_type,CONVERT(VARCHAR,ChangeTime,111)+' '+CONVERT(VARCHAR,ChangeTime,108) Time,mc.MachineName Machine 
    from PDL_CKHistory(nolock)m 
    inner join PDL_Machine(nolock) mc 
    on m.Machine = mc.MachineId 
    inner join ClassIssType(nolock)t 
    on m.isstype=t.ITypeCode 
    inner join prodbasic(nolock) b 
    on b.PartNum = m.partnum and b.Revision=m.revision  
    where proccode in ('PSP23') 
    and IsCancel is null 
    and BefStatus in ('CheckIn') 
    and AftStatus in ('CheckOut') 
    and ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'`)
        .then((result) => {

            if (result.recordset.length === 0) {
                CCLot = [];
            } else {
                CCLot = result.recordset;

                CCLot.forEach((i) => {
                    i.Machine = 'CC#' + String(Number((i.Machine).substr(-3)))
                });
            };

            const lt = `'${result.recordset.map((i) => i.lotno.replace(/\s/g, '')).join("','")}'`;

            return Promise.all([
                poolDc.query(`Select * from (Select T.LN, T.[VRS Judge],Count_m Unit,Sum(Round((Cast(Count as real)/Cast(Count_m As real)),4))Rate
            from (Select LN,Case when [VRS Judge]='Good' OR [VRS Judge]='Pass' then 'Yield' when InspType='Missing' then 'T15' else 'T44' end [VRS Judge],Count([VRS Judge])Count from YM_CCAOI_RawData where LN in (${lt}) and [VRS Judge] in ('Good','NG','Pass') Group by LN,[VRS Judge],InspType)T inner join 
            (Select LN,Count(*)Count_m  from YM_CCAOI_RawData where LN in (${lt}) and [VRS Judge] in ('Good','NG','Pass') Group by LN)M on T.LN=M.LN Group by T.LN,T.[VRS Judge],M.Count_m)t Pivot (MAX(Rate) For [VRS Judge] in ([Yield],[T44],[T15]))k`),
                poolDc.query(`Select DISTINCT Left(partnum,7)partno,LN lotno,Substring([QP-ID],12,2)boardno,Right([QP-ID],1)quarter,Case when Right([QP-ID],1)='3' OR Right([QP-ID],1)='5' then UnitX else UnitX+h.MpLtX end panel_x,Case when Right([QP-ID],1)='3' OR Right([QP-ID],1)='1' then UnitY else UnitY+h.MpLtY end panel_y,UnitX unit_x,UnitY unit_y,CapID cap_id,PartNumber partnumber,Defect,h.MpLtX,h.MpLtY from 
                ((Select LN,[QP-ID],UnitX,UnitY,CapID,PartNumber,Case when InspType='Missing' then 'T15' else 'T44' end Defect from YM_CCAOI_Cap_RawData where LN in (${lt}) and [VRS Judge] not in ('Good','Pass','BadMark'))T inner join 
                (Select partnum,revision,lotnum,proccode from v_pdl_ckhistory where lotnum in (${lt}) and proccode in ('PSP23') and BefStatus in ('CheckIn') and AftStatus in ('CheckOut')) M on T.LN=M.lotnum) inner join YM_Layout_Center_Head(nolock)h on Left(M.partnum,7)=Left(h.JobName,7)`)])
        })
        .then(([result, resultMap]) => {
            CCLot.forEach((i) => {
                const data = result.recordset.find((r) => i.lotno.replace(/\s/g, '') === r.LN);
                if (data !== undefined) {///有match
                    i.Unit = data.Unit === null ? '.' : data.Unit;
                    i.Yield = data.Yield === null ? '.' : data.Yield.toFixed(4);
                    i.T44 = data.T44 === null ? '.' : data.T44.toFixed(4);
                    i.T15 = data.T15 === null ? '.' : data.T15.toFixed(4);
                    i.Remark = '';
                } else {
                    i.Unit = '.';
                    i.Yield = '.';
                    i.T44 = '.';
                    i.T15 = '.';
                    i.Remark = '';
                };

            });

            resultMap.recordset.forEach((i) => {
                const data = CCLot.find((r) => i.lotno === r.lotno.replace(/\s/g, ''));

                if (data !== undefined) {
                    i.Time = data.Time;
                } else {
                    i.Time = '.';
                }
            });

            res.json({
                ccreadout: { data: CCLot, db: 'ccaoi', table: 'ccyieldv2', match:['yield','T44','T15']},
                ccmapping: { data: resultMap.recordset, db: 'ccaoi', table: 'cc_map_t', match:['defect']  }
            });
        })
        .catch((err) => {
            console.log(err)
        })
        .finally(() => {
            sql.close();
        });
});

router.get('/weeklystack', (req, res) => {

    mysqlConnection(configFunc('ccaoi'))
        .then((connection) => {

            const sqlStr = `SELECT CASE WHEN 
            LENGTH(CAST(Week(Time)+1 as char))=1 THEN CAST(CONCAT(CAST(Year(Time)as char),'0',CAST(Week(Time)+1 as char)) as real) 
            ELSE CAST(CONCAT(CAST(Year(Time)as char),CAST(Week(Time)+1 as char)) as real) end as Week
            ,Time,partno,lotno,lot_type,Unit,Machine,
            CAST(Yield as real)Yield,
            CAST(T44 as real)T44,
            CAST(T15 as real)T15 FROM ccyieldv2 
            WHERE Yield<>'0' AND Unit<>'.' AND  Left(partno,4)<>'UMGL' AND Left(lot_type,2) NOT IN ('E3')`;
            
            return queryFunc(connection, sqlStr)

        })
        .then((result) => {
            // res.json(result)
            const promiseAry = [];
            const weekStart = 0;
            const weekEnd = 2;

            // const partnoAry = [...new Set(result.map((i) => `${i.partno}-${i.Week}`))];
            const partnoAry = [...new Set(result.map((i) => i.partno))];
            const groupAry = [];
            partnoAry.forEach((p) => {
                const obj = {};
                obj.part = p;
                obj.weekAry = [...new Set(result.filter((i) => i.partno === p).map((i) => i.Week))].sort((a, b) => b - a);
                groupAry.push(obj);
            });

            groupAry.forEach((g) => {
                const weekAry = g.weekAry.slice(weekStart, weekEnd);
                console.log(g,weekAry)
                weekAry.forEach((w) => {

                    let lotStr = `'${result.filter((i) => i.Week === w && i.partno === g.part).map((i) => i.lotno).join("','")}'`;
                    let sqlStr = `
                    with dt as (Select LN,UnitX,UnitY,[VRS Judge],Sum(Count)Sum from (Select LN,UnitX,UnitY,case when [VRS Judge]='Good' OR [VRS Judge]='Pass' then 'Pass' when InspType='Missing' then 'T15' else 'T44' end [VRS Judge],Count(*)Count 
                    from YM_CCAOI_RawData where LN in (${lotStr}) and [VRS Judge] in ('Good','NG','Pass') Group by LN,UnitX,UnitY,[VRS Judge],InspType)T Group by LN,UnitX,UnitY,[VRS Judge])

                    Select * from (
                    Select Week='${w}',PartNo='${g.part}',t.LN,t.UnitX+t.UnitY UnitCode,t.UnitX,t.UnitY,t.[VRS Judge],t.Sum,m.Total from dt t left join (Select LN,UnitX,UnitY,Sum(Sum)Total from dt Group by LN,UnitX,UnitY)m 
                    on t.LN=m.LN and t.UnitX=m.UnitX and t.UnitY=m.UnitY 
                    Union
                    Select Week='${w}',PartNo='${g.part}',t.LN,t.UnitX+t.UnitY UnitCode,t.UnitX,t.UnitY,[VRS Judge]='All',Sum(Sum)Sum,m.Total from dt t  left join (Select LN,UnitX,UnitY,Sum(Sum)Total from dt Group by LN,UnitX,UnitY)m 
                    on t.LN=m.LN and t.UnitX=m.UnitX and t.UnitY=m.UnitY where [VRS Judge]<>'Pass' Group by t.LN,t.UnitX,t.UnitY,m.Total)p Pivot (Max(Sum) For [VRS Judge] in ([Pass],[All],[T44],[T15]))k`;

                    promiseAry.push(poolDc.query(sqlStr));

                });
            });

            return Promise.all(promiseAry);
        })
        .then((resultAry) => {
            // res.json(resultAry)
            const defectAry = ['All', 'T44', 'T15'];

            let ccData = [];
            const summaryData = [];

            resultAry.forEach((i) => {
                ccData = [...ccData, ...i.recordset];
            });

            const weekAry = [...new Set(ccData.map((i) => i.Week))];

            weekAry.forEach((w) => {
                const weekData = ccData.filter((i) => i.Week === w);

                const partAry = [...new Set(weekData.map((i) => i.PartNo))];

                partAry.forEach((p) => {

                    const partData = weekData.filter((i) => i.PartNo === p);

                    const xyAry = [...new Set(partData.map((i) => i.UnitX + '_' + i.UnitY))];

                    xyAry.forEach((i) => {
                        const Obj = {};
                        const xyParams = i.split('_');

                        Obj.partno = p;
                        Obj.Week = w;
                        Obj.UnitX = xyParams[0];
                        Obj.UnitY = xyParams[1];

                        const filterData = partData.filter((d) => `${d.UnitX}_${d.UnitY}` === i);
                        const totalCount = filterData.map((f) => f.Total).reduce((pre, cur) => pre + cur, 0);

                        defectAry.forEach((defect) => {
                            Obj[`${defect}_rate`] = (filterData.map((f) => f[defect] === null ? 0 : f[defect]).reduce((pre, cur) => pre + cur, 0) / totalCount).toFixed(3)
                        });

                        summaryData.push(Obj);

                    })

                })
            });

            res.json(
                {
                    ccweekly: {
                        data: summaryData,
                        db: 'ccaoi',
                        table: 'cc_stack',
                        match: ['All_rate', 'T44_rate', 'T15_rate']
                    }
                }
            );
        })
})

// 獲取文件列表的端點
router.get('/fetch-file-list', async (req, res) => {
  const sftp = new Client();

  try {
    await sftp.connect(config.sftpConfig);
    console.log('已成功連接到 SFTP 服務器');

    const remotePath = '/ccaoi/SPI/CCSPI2/3273053A08/22BOE002-01-00/';
    const fileList = await sftp.list(remotePath);
    const csvFiles = fileList.filter(file => file.name.endsWith('.csv'));

    const page = parseInt(req.query.page) || 1;
    const pageSize = 100;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedFiles = csvFiles.slice(startIndex, endIndex).map(file => file.name);

    res.json({
      totalFiles: csvFiles.length,
      currentPage: page,
      totalPages: Math.ceil(csvFiles.length / pageSize),
      files: paginatedFiles
    });

  } catch (err) {
    console.error('發生錯誤：', err);
    res.status(500).json({ error: '獲取文件列表時發生錯誤', details: err.message });
  } finally {
    await sftp.end();
    console.log('SFTP 連接已關閉');
  }
});

// 獲取單個文件內容的端點
router.get('/fetch-file/:fileName', async (req, res) => {
  const sftp = new Client();

  try {
    await sftp.connect(config.sftpConfig);
    console.log('已成功連接到 SFTP 服務器');

    const remotePath = '/ccaoi/SPI/CCSPI2/3273053A08/22BOE002-01-00/';
    const fileName = req.params.fileName;
    const remoteFilePath = path.join(remotePath, fileName);

    res.setHeader('Content-Type', 'application/json');
    res.write('[');

    let isFirst = true;
    const jsonTransform = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const jsonChunk = JSON.stringify(chunk);
        this.push((isFirst ? '' : ',') + jsonChunk);
        isFirst = false;
        callback();
      }
    });

    const stream = await sftp.createReadStream(remoteFilePath);

    stream
      .pipe(csv())
      .pipe(jsonTransform)
      .pipe(res, { end: false });

    stream.on('end', () => {
      res.write(']');
      res.end();
      sftp.end();
    });

  } catch (err) {
    console.error('發生錯誤：', err);
    res.status(500).json({ error: '獲取文件內容時發生錯誤', details: err.message });
    sftp.end();
  }
});

module.exports = router