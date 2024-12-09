const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS, timestampToYMDHIS2 } = require('../time');
const { mysqlConnection, queryFunc } = require('../mysql');
const { poolAcme, poolDc, poolNCN } = require('../mssql');
const { configFunc } = require('../config');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/dailyadd', (req, res) => {

    const endTime = new Date();
    endTime.setHours(8, 0, 0, 0);
    const t8sqlTime = endTime.toLocaleDateString() + ' ' + endTime.toTimeString().slice(0, 8);

    endTime.setDate(endTime.getDate() - 10);
    endTime.setHours(8, 0, 0, 0);
    const l8sqlTime = endTime.toLocaleDateString() + ' ' + endTime.toTimeString().slice(0, 8);

    let outerConnection = null;
    let readoutData = [];
    let defectData = [];

    mysqlConnection(configFunc('fli'))
        .then((connection) => {
            outerConnection = connection;
            const readoutStr = `SELECT DISTINCT Left(p.partnum,7)PN,lotnum LotNum,ITypeName LotType,convert(varchar, ChangeTime, 120)Time from
                    PDL_CKhistory(nolock)p
                    LEFT JOIN ClassIssType(nolock)t 
                    ON p.isstype=t.ITypeCode
                    where LEFT(p.partnum,1)!='U' 
                    AND proccode='FLI18' 
                    AND BefStatus='CheckIn' 
                    AND AftStatus='Checkout' 
                    AND ChangeTime BETWEEN '${l8sqlTime}' and '${t8sqlTime}'`;
            const totalDefctStr = `SELECT DISTINCT Classify from V_FLI_LayotDetail_Jmp(nolock) where Classify<>'0'`;
            const mysqlStr = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='fliyield'`;

            return Promise.all(
                [
                    poolAcme.query(readoutStr),
                    poolDc.query(totalDefctStr),
                    queryFunc(connection, mysqlStr)
                ]
            )

        })
        .then((result) => {
            
            const existColumn = ['PN', 'LotNum', 'LotType', 'Yield', 'Time', 'Remark'];
            readoutData = result[0].recordset;
            defectData = result[1].recordset;
            const mysqlDefect = result[2].map((i) => i['COLUMN_NAME']).filter((i) => !existColumn.includes(i));
            const matchDefect = defectData.map((i) => i.Classify);

            // 確認抓出的defect在資料庫都存在欄位
            // 不存在則新增

            let nonExistAry = [];
            matchDefect.forEach((m) => {
                const idx = mysqlDefect.findIndex((i) => i === m);
                if (idx === -1) {
                    nonExistAry.push(m)
                };
            });

            let addtoMysql = '';
            if (nonExistAry.length > 0) {///有新增的缺點
                const addColumnStr = nonExistAry.map((i) => `ADD COLUMN ${i} Char(20)`).join(',');
                addtoMysql = `ALTER TABLE fliyield ${addColumnStr}`;
            }
            return addtoMysql !== '' ? queryFunc(outerConnection, addtoMysql) : true
        })
        .then(() => {

            const lotStr = `'${readoutData.map((i) => i.LotNum).join("','")}'`;
            const pivotDefect = `[${defectData.map((d) => d.Classify).join("],[")}]`;
            const columnDefect = `${defectData.map((d) => d.Classify).join(',')}`;
            
            // const sqlStr = `with dt as
            // (Select LotNum,Classify,Rate,ROW_NUMBER() OVER (PARTITION BY LotNum Order BY [Rate] desc) Rank from 
            // (Select T.LotNum,T.Classify,Round(Cast(T.Count as real)/Cast(F.Qnty_S as real),4) Rate from 
            // (SELECT LotNum,Classify,Count(*) Count from 
            // (Select * from YM_ULT_FLIVRS_Test_Result(nolock) where LotNum in (${lotStr}) and Layer='0' and UnitDefect='1' and Classify<>'0')t
            // Group by LotNum,Classify
            // ) T
            
            // inner join 
            // (select lotnum,Qnty_S from v_pdl_ckhistory where lotnum in (${lotStr}) and proccode='FLI18' and BefStatus='CheckIn' and AftStatus='Checkout') F
            // on T.LotNum=F.lotnum)p
            // )
            
            // Select k.LotNum,Top_1,Top1,Top_2,Top2,Top_3,Top3,Yield,${columnDefect} from 
            // (Select LotNum,Classify,'Top_'+Cast(Rank as varchar)Rank from dt where Rank<=3)p PIVOT (Max(Classify) FOR Rank in ([Top_1],[Top_2],[Top_3]))k 
            // inner join 
            // (Select LotNum,Rate,'Top'+Cast(Rank as varchar)Rank from dt where Rank<=3)p PIVOT (Max(Rate) FOR Rank in ([Top1],[Top2],[Top3]))j
            // on k.LotNum=j.LotNum
            // inner join 
            // (Select LotNum,1-Sum(Rate) Yield from dt group by LotNum)y
            // on k.LotNum=y.LotNum
            // inner join
            // (SELECT LotNum,Rate,Classify from dt) p PIVOT (Max(Rate) FOR Classify in (${pivotDefect}))d
            // on k.LotNum=d.LotNum`

            const sqlStr=`with dt as (
    Select 
        LotNum,
        Classify,
        Rate,
        ROW_NUMBER() OVER (PARTITION BY LotNum Order BY [Rate] desc) Rank 
    from (
        Select 
            T.LotNum,
            T.Classify,
            Round(Cast(T.Count as real)/Cast(F.Qnty_S as real),4) Rate 
        from (
            SELECT 
                LotNum,
                Classify,
                Count(*) Count 
            from (
                Select * 
                from YM_ULT_FLIVRS_Test_Result(nolock) 
                where LotNum in (${lotStr}) 
                and Layer='0' 
                and UnitDefect='1' 
                and Classify<>'0'
            )t
            Group by LotNum,Classify
        ) T
        inner join (
            select 
                lotnum,
                Qnty_S 
            from v_pdl_ckhistory 
            where lotnum in (${lotStr}) 
            and proccode='FLI18' 
            and BefStatus='CheckIn' 
            and AftStatus='Checkout'
        ) F on T.LotNum=F.lotnum
    )p
)

Select 
    k.LotNum,
    Top_1,
    Top1,
    Top_2,
    Top2,
    Top_3,
    Top3,
    Yield,
    ${columnDefect} 
from (
    Select 
        LotNum,
        Classify,
        'Top_'+Cast(Rank as varchar)Rank 
    from dt 
    where Rank<=3
)p 
PIVOT (Max(Classify) FOR Rank in ([Top_1],[Top_2],[Top_3]))k
inner join (
    Select 
        LotNum,
        Rate,
        'Top'+Cast(Rank as varchar)Rank 
    from dt 
    where Rank<=3
)p 
PIVOT (Max(Rate) FOR Rank in ([Top1],[Top2],[Top3]))j on k.LotNum=j.LotNum
inner join (
    Select 
        LotNum,
        1-Sum(Rate) Yield 
    from dt 
    group by LotNum
)y on k.LotNum=y.LotNum
inner join (
    SELECT 
        LotNum,
        Rate,
        Classify 
    from dt
) p 
PIVOT (Max(Rate) FOR Classify in (${pivotDefect}))d on k.LotNum=d.LotNum`
            // res.json(sqlStr)
            return poolDc.query(sqlStr)
        })
        .then((result) => {
            
            const rawData = result.recordset;
            
            rawData.forEach((r) => {
                const matchData = readoutData.find((i) => r.LotNum === i.LotNum);
                if (matchData) {
                    const { PN, LotType, Time } = matchData;
                    r.PN = PN;
                    r.LotType = LotType;
                    r.Time = Time;
                    r.Remark = '';
                } else {
                    r.PN = '';
                    r.LotType = '';
                    r.Time = '';
                    r.Remark = '';
                };

            });

            res.json(
                {
                    daily: {
                        data: rawData,
                        db: 'fli',
                        table: 'fliyield',
                        match: ['Top_1', 'Top1', 'Top2', 'Top_2', 'Top3', 'Top_3', 'Yield', 'sf_link', 'A7', 'S15', 'S9', 'A17', 'A19', 'A21', 'S12', 'S11', 'S13', 'S14', 'A1', 'S10', 'O10', 'A20', 'A18', 'Remark', 'A22', 'A71', 'J6', 'ULMark94V', 'LayerCount', 'A10', 'A12', 'A13', 'A16', 'A2', 'A41', 'A5', 'A6', 'A8', 'A9', 'O1', 'O52', 'O8', 'P2', 'P3', 'S2', 'S21', 'B4' ]
                    }
                }
            );
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/weeklystack', (req, res) => {

    mysqlConnection(configFunc('fli'))
        .then((connection) => {

            const sqlStr1=`SELECT CASE WHEN 
             LENGTH(CAST(Week(Time)+1 as char))=1 THEN CAST(CONCAT(CAST(Year(Time)as char),'0',CAST(Week(Time)+1 as char)) as real) ELSE CAST(CONCAT(CAST(Year(Time)as char),CAST(Week(Time)+1 as char)) as real) end as Week
              ,Time,PN,LotNum,LotType,
              CAST(A7 as real)A7,
              CAST(S15 as real)S15,
              CAST(P3 as real)P3,
              CAST(S9 as real)S9,
              CAST(O8 as real)O8,
              CAST(A8 as real)A8,
              CAST(S21 as real)S21,
              CAST(A13 as real)A13,
              CAST(P2 as real)P2,
              CAST(A5 as real)A5,
              CAST(A17 as real)A17,
              CAST(A9 as real)A9,
              CAST(A19 as real)A19,
              CAST(A21 as real)A21,
              CAST(S12 as real)S12,
              CAST(O52 as real)O52,
              CAST(S2 as real)S2,
              CAST(A16 as real)A16,
              CAST(A41 as real)A41,
              CAST(S11 as real)S11,
              CAST(S13 as real)S13,
              CAST(S14 as real)S14,
              CAST(A1 as real)A1,
              CAST(S10 as real)S10,
              CAST(A2 as real)A2,
              CAST(A6 as real)A6,
              CAST(O10 as real)O10,
              CAST(A20 as real)A20,
              CAST(O1 as real)O1,
              CAST(A10 as real)A10,
              CAST(A12 as real)A12,
              CAST(A18 as real)A18,
              CAST(A22 as real)A22,
              CAST(A71 as real)A71,
              CAST(J6 as real)J6,
              CAST(LayerCount as real)LayerCount
                FROM fliyield `;
            return queryFunc(connection, sqlStr1)

        })
        .then((result) => {
            //  res.json(result)

            const promiseAry = [];
            const weekStart = 0;
            const weekEnd = 2;

            // const partnoAry = [...new Set(result.map((i) => `${i.partno}-${i.Week}`))];
            const partnoAry = [...new Set(result.map((i) => i.PN))];
            
            const groupAry = [];
            partnoAry.forEach((p) => {
                const obj = {};
                obj.part = p;
                obj.weekAry = [...new Set(result.filter((i) => i.PN === p).map((i) => i.Week))].sort((a, b) => b - a);
                groupAry.push(obj);
            });
            console.log(groupAry)
            groupAry.forEach((g) => {
                const weekAry = g.weekAry.slice(weekStart, weekEnd);
                console.log(weekAry)
                weekAry.forEach((w) => {

                    let lotStr = `'${result.filter((i) => i.Week === w && i.PN === g.part).map((i) => i.lotno).join("','")}'`;
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
            res.json(resultAry[0].recordset)
            // const defectAry = ['All', 'T44', 'T15'];

            // let ccData = [];
            // const summaryData = [];

            // resultAry.forEach((i) => {
            //     ccData = [...ccData, ...i.recordset];
            // });

            // const weekAry = [...new Set(ccData.map((i) => i.Week))];

            // weekAry.forEach((w) => {
            //     const weekData = ccData.filter((i) => i.Week === w);

            //     const partAry = [...new Set(weekData.map((i) => i.PartNo))];

            //     partAry.forEach((p) => {

            //         const partData = weekData.filter((i) => i.PartNo === p);

            //         const xyAry = [...new Set(partData.map((i) => i.UnitX + '_' + i.UnitY))];

            //         xyAry.forEach((i) => {
            //             const Obj = {};
            //             const xyParams = i.split('_');

            //             Obj.partno = p;
            //             Obj.Week = w;
            //             Obj.UnitX = xyParams[0];
            //             Obj.UnitY = xyParams[1];

            //             const filterData = partData.filter((d) => `${d.UnitX}_${d.UnitY}` === i);
            //             const totalCount = filterData.map((f) => f.Total).reduce((pre, cur) => pre + cur, 0);

            //             defectAry.forEach((defect) => {
            //                 Obj[`${defect}_rate`] = (filterData.map((f) => f[defect] === null ? 0 : f[defect]).reduce((pre, cur) => pre + cur, 0) / totalCount).toFixed(3)
            //             });

            //             summaryData.push(Obj);

            //         })

            //     })
            // });

            // res.json(
            //     {
            //         ccweekly: {
            //             data: summaryData,
            //             db: 'ccaoi',
            //             table: 'cc_stack',
            //             match: ['All_rate', 'T44_rate', 'T15_rate']
            //         }
            //     }
            // );
        })
})



module.exports = router;
