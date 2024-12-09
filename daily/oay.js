const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS } = require('../time');

const { dailyAdd, gettoDB } = require('../daily/dailyFunc');
const { mysqlConnection, queryFunc } = require('../mysql');
const { configFunc } = require('../config');
const { poolAcme, poolDc, poolMetrology } = require('../mssql')

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

const configAcme = {
    server: '10.22.65.120',
    user: 'dc',
    password: 'dc',
    database: 'acme',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 1200000
    }
};

const configDc = {
    server: '10.22.65.120',
    user: 'dc',
    password: 'dc',
    database: 'dc',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 300000
    },
    pool: {
        max: 10000,
        min: 0,
        idleTimeoutMillis: 3000000
    }
};

const configMetrology = {
    server: '10.22.66.37',
    user: 'ymyip',
    password: 'pr&rZw93',
    database: 'YM_Metrology',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 300000
    },
    pool: {
        max: 10000,
        min: 0,
        idleTimeoutMillis: 3000000
    }
};

router.get('/oayyield', (req, res) => {

    const curDate = new Date()
    let date = curDate.getDate();
    curDate.setHours(8, 0, 0, 0);
    let t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    const filterDayOfMonth = new Date(curDate.getFullYear(), date === 1 ? curDate.getMonth() - 1 : curDate.getMonth(), 1);
    filterDayOfMonth.setHours(0, 0, 0, 0);

    let l8sqlTime = filterDayOfMonth.toLocaleDateString() + ' ' + filterDayOfMonth.toTimeString().slice(0, 8);

    let oayData = [];
    let delbeforeData = [];
    let lotAry = [];
    let cccheckData = [];

    let ostData = [];
    let bdostData = [];
    let ccData = [];
    let bumpData = [];
    let viData = [];
    let wpgData = [];
    let ultbpData = [];

    let bumposatData = [];
    let viosatData = [];
    let wpgosatData = [];
    let connection;

    mysqlConnection(configFunc('oay'))
        .then((conn) => {
            connection = conn;
            const sqldata = `SELECT lotnum,Remark FROM oayyield WHERE ChangeTime >='${l8sqlTime}' AND Remark<>''`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            delbeforeData = result;
            const sqldata = `DELETE FROM oayyield WHERE ChangeTime >= '${l8sqlTime}'`;

            return queryFunc(connection, sqldata);
        })
        .then((result) => {
            
            return sql.connect(configAcme)
        })
        .then(() => {
            console.log('1',`with lt as (
                Select DISTINCT c.IOTime,c.lotnum,c.partno,Case when ProdClass='CPU' then 'Client' else ProdClass end ProdClass,LotType,quan_sch In_Qnty,quan_prod  Out_Qnty,Notes='非併批' from PDL_CompleteLot_Yield(nolock) c  
                left join prodbasic(nolock)d on c.partno=Rtrim(d.PartNum)+Revision 
                left join (Select ReleaseDate,LotNum,OldLotNum,Remarki='m' from PDL_IssueDtl(nolock) where OldLotNum is not null) i on c.lotnum=i.OldLotNum
                left join (Select ReleaseDate,LotNum,OldLotNum,Remarkj='s' from PDL_IssueDtl(nolock) where OldLotNum is not null) j on Left(c.lotnum,12)=Left(j.LotNum,12) 
                left join (Select DISTINCT 批號,代碼 from V_RejectList where 代碼='K801')r on c.lotnum=r.批號
                where quan_sch IS NOT NULL AND  
                ((i.Remarki is null or (i.ReleaseDate-c.IOTime>0 and Month(i.ReleaseDate)<>Month(c.IOTime)))
                and 
                (j.Remarkj is null or ( j.ReleaseDate-c.IOTime>0 and Month(j.ReleaseDate)<>Month(c.IOTime)))) 
                and 代碼 is null and Left(LotType,2) not in ('E3','R3','E4') and c.IOTime between '$2024/7/2 00:00:00' and '2024/7/2 12:00:00'
                Union
                SELECT DISTINCT IOTime,LotNum lotnum,RTrim(f.PartNum)+f.Revision partno,ProdClass,ITypeName LotType,QUAN_SCH In_Qnty,QUAN_PROD Out_Qnty,Notes from fin_oay(nolock) f left join prodbasic(nolock)d on RTrim(f.PartNum)+f.Revision=Rtrim(d.PartNum)+d.Revision where Notes='被併批' and quan_sch IS NOT NULL and Left(ITypeName,2) not in ('E3','R3','E4') and IOTime between '2024/7/2 00:00:00' and '2024/7/2 12:00:00')
                
                SELECT Rtrim(lt.lotnum)lotnum,PARTNO,c.Count,ProdClass,LotType lot_type,In_Qnty,Out_Qnty,
                Case when Out_Qnty='0' and Count='1' then 'Div_Scrap' when Out_Qnty='0' then 'Prc_Scrap' else 'InStock' end type,
                Left(b.ProcName,3)+Cast(b.BefDegree As varchar)+Right(b.ProcName,3)+Cast(b.BefTimes As varchar) Beg_Prc,
                Left(e.ProcName,3)+Cast(e.BefDegree As varchar)+Right(e.ProcName,3)+Cast(e.BefTimes As varchar) End_Prc,
                convert(varchar, e.ChangeTime, 120)ChangeTime,convert(varchar, lt.IOTime, 120) IOTime FROM lt
                INNER JOIN (SELECT lotnum,Count(*)Count FROM PDL_CKHistory(nolock) WHERE lotnum IN (SELECT DISTINCT lotnum FROM lt)group by lotnum)c ON lt.lotnum=c.lotnum
                INNER JOIN (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime FROM (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime,ROW_NUMBER() OVER (PARTITION BY lotnum Order BY ChangeTime ) Rank from PDL_CKHistory(nolock)k INNER JOIN ProcBasic b on k.ProcCode=b.ProcCode WHERE  BefStatus='CheckIn' and  AftStatus='CheckOut' and lotnum in (Select DISTINCT lotnum from lt) )p where Rank='1') b ON lt.lotnum=b.lotnum 
                INNER JOIN (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime FROM (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime,ROW_NUMBER() OVER (PARTITION BY lotnum Order BY ChangeTime desc ) Rank from PDL_CKHistory(nolock)k INNER JOIN ProcBasic b on k.ProcCode=b.ProcCode WHERE  BefStatus='CheckIn' and  AftStatus='CheckOut' and lotnum in (Select DISTINCT lotnum from lt) )p where Rank='1') e ON lt.lotnum=e.lotnum 
                `)

            return sql.query(`with lt as (
                Select DISTINCT c.IOTime,c.lotnum,c.partno,Case when ProdClass='CPU' then 'Client' else ProdClass end ProdClass,LotType,quan_sch In_Qnty,quan_prod  Out_Qnty,Notes='非併批' from PDL_CompleteLot_Yield(nolock) c  
                left join prodbasic(nolock)d on c.partno=Rtrim(d.PartNum)+Revision 
                left join (Select ReleaseDate,LotNum,OldLotNum,Remarki='m' from PDL_IssueDtl(nolock) where OldLotNum is not null) i on c.lotnum=i.OldLotNum
                left join (Select ReleaseDate,LotNum,OldLotNum,Remarkj='s' from PDL_IssueDtl(nolock) where OldLotNum is not null) j on Left(c.lotnum,12)=Left(j.LotNum,12) 
                left join (Select DISTINCT 批號,代碼 from V_RejectList where 代碼='K801')r on c.lotnum=r.批號
                where quan_sch IS NOT NULL AND  
                ((i.Remarki is null or (i.ReleaseDate-c.IOTime>0 and Month(i.ReleaseDate)<>Month(c.IOTime)))
                and 
                (j.Remarkj is null or ( j.ReleaseDate-c.IOTime>0 and Month(j.ReleaseDate)<>Month(c.IOTime)))) 
                and 代碼 is null and Left(LotType,2) not in ('E3','R3','E4') and c.IOTime between '${l8sqlTime}' and '${t8sqlTime}'
                Union
                SELECT DISTINCT IOTime,LotNum lotnum,RTrim(f.PartNum)+f.Revision partno,ProdClass,ITypeName LotType,QUAN_SCH In_Qnty,QUAN_PROD Out_Qnty,Notes from fin_oay(nolock) f left join prodbasic(nolock)d on RTrim(f.PartNum)+f.Revision=Rtrim(d.PartNum)+d.Revision where Notes='被併批' and quan_sch IS NOT NULL and Left(ITypeName,2) not in ('E3','R3','E4') and IOTime between '${l8sqlTime}' and '${t8sqlTime}')
                
                SELECT Rtrim(lt.lotnum)lotnum,PARTNO,c.Count,ProdClass,LotType lot_type,In_Qnty,Out_Qnty,
                Case when Out_Qnty='0' and Count='1' then 'Div_Scrap' when Out_Qnty='0' then 'Prc_Scrap' else 'InStock' end type,
                Left(b.ProcName,3)+Cast(b.BefDegree As varchar)+Right(b.ProcName,3)+Cast(b.BefTimes As varchar) Beg_Prc,
                Left(e.ProcName,3)+Cast(e.BefDegree As varchar)+Right(e.ProcName,3)+Cast(e.BefTimes As varchar) End_Prc,
                convert(varchar, e.ChangeTime, 120)ChangeTime,convert(varchar, lt.IOTime, 120) IOTime FROM lt
                INNER JOIN (SELECT lotnum,Count(*)Count FROM PDL_CKHistory(nolock) WHERE lotnum IN (SELECT DISTINCT lotnum FROM lt)group by lotnum)c ON lt.lotnum=c.lotnum
                INNER JOIN (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime FROM (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime,ROW_NUMBER() OVER (PARTITION BY lotnum Order BY ChangeTime ) Rank from PDL_CKHistory(nolock)k INNER JOIN ProcBasic b on k.ProcCode=b.ProcCode WHERE  BefStatus='CheckIn' and  AftStatus='CheckOut' and lotnum in (Select DISTINCT lotnum from lt) )p where Rank='1') b ON lt.lotnum=b.lotnum 
                INNER JOIN (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime FROM (SELECT lotnum,ProcName,BefDegree,BefTimes,ChangeTime,ROW_NUMBER() OVER (PARTITION BY lotnum Order BY ChangeTime desc ) Rank from PDL_CKHistory(nolock)k INNER JOIN ProcBasic b on k.ProcCode=b.ProcCode WHERE  BefStatus='CheckIn' and  AftStatus='CheckOut' and lotnum in (Select DISTINCT lotnum from lt) )p where Rank='1') e ON lt.lotnum=e.lotnum 
                `)
                
                
        })
        .then((result) => {
            console.log('2')
            oayData = result.recordset.filter((i) => new Date(String(i.ChangeTime).substring(0, 10) + ' ' + String(i.ChangeTime).substring(11, 19)) >= new Date(l8sqlTime));

            lotStr = `'${result.recordset.map((i) => i.lotnum).join("','")}'`;
            partreStr = `'${result.recordset.map((i) => i.PARTNO).join("','")}'`;

            // wpg
            const wpgsqlStr = `Select T.lotnum LotNum,WPG_Check_in,case when SQnty is null then '0' else SQnty end WPG_NG,case when Round(1-(Cast(SQnty as real)/Cast(WPG_Check_in as real)),4) is null then '1' else Round(1-(Cast(SQnty as real)/Cast(WPG_Check_in as real)),4) end WPG_yield 
            from(SELECT  lotnum,Qnty WPG_Check_in from PDL_CKHistory(nolock)
                c where proccode ='FVI59' and BefStatus='MoveIn' and AftStatus='CheckIn' and lotnum in (${lotStr}))T 
            left join (Select  批號,SQnty from V_RejectList where 批號 in (${lotStr}) and 代碼='K600' and 製程站簡碼='FVIWPA')L on T.lotnum=L.批號`;

            // vi
            const visqlStr = `with dt as(Select  ChangeTime,lotnum,c.proccode,Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(AftDegree As varchar) eq_group,BefStatus,AftStatus,Decision,IsCancel,SQnty_S,Qnty_S,ROW_NUMBER() OVER (PARTITION BY lotnum Order BY ChangeTime) Rank from PDL_CKHistory(nolock) h inner join Procbasic c on h.proccode =c.ProcCode  
            where lotnum in (Select DISTINCT lotnum from PDL_CKHistory(nolock) h inner join Procbasic c on h.proccode =c.ProcCode where  ProcName='FVIVRS' and BefStatus='MoveIn' and AftStatus='CheckIn' and lotnum in (${lotStr})) 
            and (
            (BefStatus='CheckIn' and AftStatus='CheckOut' and 
            Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(BefTimes As varchar) in ('FVI1VRS1','FVI1FVI1','FVI1CVI1','FVI1FQC1','FVI1VRS2')) 
            OR
            (BefStatus='MoveIn' and AftStatus='CheckIn' and 
            Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(BefTimes As varchar) in ('FVI1VRS1'))
            )
            )
            Select s.lotnum LotNum,Qnty_S VI_Check_in,Scarp_sum from ((Select lotnum,Sum(SQnty_S)Scarp_sum from dt where IsCancel is null group by lotnum)s inner join (Select lotnum,Qnty_S from dt where Rank='1') m on s.lotnum=m.lotnum)`;

            // bump OSAT

            const bumpsqlosatStr = `with dt as (Select partnum,lotnum,Qnty_S,SQnty_S,BefStatus,AftStatus from PDL_CKHistory(nolock) h 
            inner join Procbasic c 
            on h.proccode =c.ProcCode  
            where Left(partnum,4)='6111' and  ProcName='FVIBUM' and lotnum in (${lotStr}))
                
            Select m.partnum,m.lotnum LotNum,Qnty_S Bump_Check_in,SQnty_S Bump_NG,Round((1-(CAST(SQnty_S AS REAL)/CAST(Qnty_S AS REAL))),4) Bump_yield from  
            (Select partnum,lotnum,Qnty_S from dt where BefStatus='MoveIn' and AftStatus='CheckIn')m 
            inner join
            (Select partnum,lotnum,SQnty_S from dt where BefStatus='CheckIn' and AftStatus='CheckOut')s
            on m.lotnum=s.lotnum`;

            // wpg OSAT

            const wpgsqlosatStr = `with dt as (Select partnum,lotnum,Qnty_S,SQnty_S,BefStatus,AftStatus from PDL_CKHistory(nolock) h 
            inner join Procbasic c 
            on h.proccode =c.ProcCode  
            where Left(partnum,4)='6111' and  ProcName='FVIWPG' and lotnum in (${lotStr}))
                
            Select m.partnum,m.lotnum LotNum,Qnty_S WPG_Check_in,SQnty_S WPG_NG,Round((1-(CAST(SQnty_S AS REAL)/CAST(Qnty_S AS REAL))),4) WPG_yield from  
            (Select partnum,lotnum,Qnty_S from dt where BefStatus='MoveIn' and AftStatus='CheckIn')m 
            inner join
            (Select partnum,lotnum,SQnty_S from dt where BefStatus='CheckIn' and AftStatus='CheckOut')s
            on m.lotnum=s.lotnum`;

            // vi OSAT

            const visqlosatStr = `with dt as (Select partnum,lotnum,ProcName,Qnty_S,SQnty_S,BefStatus,AftStatus from PDL_CKHistory(nolock) h 
            inner join Procbasic(nolock) c 
            on h.proccode =c.ProcCode  
            where   Left(partnum,4)='6111' and  ProcName in ('FVIAVI','FVIFQC','FVIFMP','FVIPCK') and lotnum in (${lotStr})
            OR Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(AftDegree As varchar) in ('FVI1FVI1','FVI1FVI2'))

            Select m.partnum,m.lotnum LotNum,Qnty_S VI_Check_in,SQnty_S VI_NG,Round((1-(CAST(SQnty_S AS REAL)/CAST(Qnty_S AS REAL))),4) VI_Yield from  
            (Select partnum,lotnum,Qnty_S from dt where ProcName='FVIAVI' and BefStatus='MoveIn' and AftStatus='CheckIn')m
            inner join 
            (Select lotnum,Sum(SQnty_S)SQnty_S from dt where ProcName<>'FVIAVI' and BefStatus='CheckIn' and AftStatus='CheckOut' group by lotnum)s
            on m.lotnum=s.lotnum`;

            const cccheckStr = `SELECT * FROM V_PnumProcRouteDtl(nolock)
            WHERE partnum+Revision in (${partreStr}) 
            and proccode='PSP23'`;

            return Promise.all([
                sql.query(wpgsqlStr),
                sql.query(visqlStr),
                sql.query(bumpsqlosatStr),
                sql.query(wpgsqlosatStr),
                sql.query(visqlosatStr),
                sql.query(cccheckStr)
            ]);
        })
        .then((resultAry) => {

            wpgData = resultAry[0].recordset;
            viData = resultAry[1].recordset;
            bumposatData = resultAry[2].recordset;
            wpgosatData = resultAry[3].recordset;
            viosatData = resultAry[4].recordset;
            cccheckData = resultAry[5].recordset;

            sql.close();
            return sql.connect(configDc)
        })
        .then(() => {
            console.log('3')
            // ost
            const ostsqlStr = `with dt as(Select DISTINCT LotNum from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr}) and ScrappedSource in ('TST09'))
            Select a.LotNum,Case when OST_NG is null then '0' else OST_NG end OST_NG,OST_Check_in,Case when OST_NG is null then '1' else Round((1-(Cast(OST_NG as real)/Cast(OST_Check_in as real))),4) end OST_Yield  from 
            ( Select LotNum,Count(*)OST_Check_in from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr})  group by LotNum)a
            inner join 
            (Select LotNum,Count(*)OST_NG from YM_ULT_UnitBase(nolock) where LotNum in (Select LotNum from dt) and ScrappedSource in ('0 VRS','TST09') group by LotNum) d
            on a.LotNum=d.LotNum`;

            // bdost
            const ostbdsqlStr = `with dt as(Select DISTINCT LotNum from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr}) and ScrappedSource in ('TST25'))
            Select a.LotNum,Case when OST_BD_NG is null then '0' else OST_BD_NG end OST_BD_NG,OST_BD_Check_in,Case when OST_BD_NG is null then '1' else Round((1-(Cast(OST_BD_NG as real)/Cast(OST_BD_Check_in as real))),4) end OST_BD_Yield from 
            ( Select LotNum,Count(*)OST_BD_Check_in from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr})  group by LotNum)a
            inner join 
            (Select LotNum,Count(*)OST_BD_NG from YM_ULT_UnitBase(nolock) where LotNum in (Select LotNum from dt) and ScrappedSource in ('TST25') group by LotNum) d
            on a.LotNum=d.LotNum`;

            // cc
            const ccsqlStr = `Select M.LotNum,Count_M CC_Check_in,CASE WHEN ULT_QTY IS NULL THEN 0 ELSE ULT_QTY END CC_NG,CASE WHEN ULT_QTY IS NULL THEN 1 ELSE Round((1-(Cast(ULT_QTY as real)/Cast(Count_M as real))),4) END CC_Yield from(Select LotNum,Count(*)Count_M from YM_ULT_UnitBase(nolock) 
            where LotNum in (${lotStr}) group by LotNum)M 
            left join (Select LotNum,Count(ScrappedSource) ULT_QTY from YM_ULT_UnitBase(nolock)  
            where ScrappedSource in ('PSP23') Group by LotNum) U
            on U.LotNum=M.LotNum`;

            // ult bp(TRA)
            const ultbpStr = `Select LotNum,Count(*)TRA from YM_ULT_UnitBase(nolock) where Scrapped='1' and ScrappedSource='FVI24' and LotNum in (${lotStr}) Group by LotNum`;

            return Promise.all([
                sql.query(ostsqlStr),
                sql.query(ostbdsqlStr),
                sql.query(ccsqlStr),
                sql.query(ultbpStr),
            ])
        })
        .then((resultAry) => {

            ostData = resultAry[0].recordset;
            bdostData = resultAry[1].recordset;
            ccData = resultAry[2].recordset;
            ultbpData = resultAry[3].recordset;

            sql.close();

            return sql.connect(configMetrology)
        })
        .then(() => {
            console.log('4')
            const bumpsqlStr = `Select M.LotNum,count_m Bump_Check_in,Case when count is null then '0' else count end Bump_NG,Round(1-(Cast(case when count is null then '0' else count end as real)/Cast(count_m as real)),4) Bump_yield from (Select LotNum,Count(*) count_m from (SELECT LotNum,Defect,ROW_NUMBER() OVER (PARTITION BY LotNum,Panel,Unit_X,Unit_Y Order BY KeyDate desc) Rank
            from V_Bump_Unit_YM(nolock) where LotNum in (${lotStr}))T where Rank='1' group by LotNum)M left join (Select LotNum,Defect,Count(*) count from (SELECT LotNum,
            case when 
            (Defect is null or left(Defect,1)='J') then 'Bump_yield' else 'Bump_NG' end Defect,ROW_NUMBER() OVER (PARTITION BY LotNum,Panel,Unit_X,Unit_Y Order BY KeyDate desc) Rank
            from V_Bump_Unit_YM(nolock) where LotNum in (${lotStr}) and (Defect not in ('3D CirNG','2DID NG') or Defect is null))T where Rank='1' and Defect='Bump_NG' group by LotNum,Defect)T on M.LotNum=T.LotNum`;
            return sql.query(bumpsqlStr);
        })
        .then((result) => {
            bumpData = result.recordset;

            // 先把viData 補上 vibpData
            viData.forEach((i) => {
                const matchIdx = ultbpData.findIndex((o) => o.LotNum === i.LotNum);
                i.VI_NG = matchIdx !== -1 ? i.Scarp_sum + ultbpData[matchIdx].TRA : i.Scarp_sum;
                i.VI_Yield = Number((1 - (i.VI_NG / i.VI_Check_in)).toFixed(4));
            });

            oayData.forEach((i) => {

                // IOTime 轉換 ChangeTime 如果相等則以ChangeTime 為主
                i.IOTime === i.ChangeTime
                    ? i.ChangeTime = i.ChangeTime
                    : i.ChangeTime = i.IOTime;

                const checkIdx = cccheckData.findIndex((o) => (o.PartNum + o.Revision) === i.PARTNO);

                i.CCcheck = checkIdx !== -1 ? 1 : 0;

                const ostIdx = ostData.findIndex((o) => o.LotNum === i.lotnum);
                i.OST_NG = ostIdx !== -1 ? ostData[ostIdx].OST_NG : null;
                i.OST_Check_in = ostIdx !== -1 ? ostData[ostIdx].OST_Check_in : null;
                i.OST_Yield = ostIdx !== -1 ? ostData[ostIdx].OST_Yield : null;

                const bdostIdx = bdostData.findIndex((b) => b.LotNum === i.lotnum);
                i.OST_BD_NG = bdostIdx !== -1 ? bdostData[bdostIdx].OST_BD_NG : null;
                i.OST_BD_Check_in = bdostIdx !== -1 ? bdostData[bdostIdx].OST_BD_Check_in : null;
                i.OST_BD_Yield = bdostIdx !== -1 ? bdostData[bdostIdx].OST_BD_Yield : null;

                const ccIdx = ccData.findIndex((o) => o.LotNum === i.lotnum);
                // if(ccIdx !== -1){
                //     i.CC_Check_in=ccData[ccIdx].CC_Check_in===null?' ':String(ccData[ccIdx].CC_Check_in);
                //     i.CC_NG=ccData[ccIdx].CC_NG===null?' ':String(ccData[ccIdx].CC_NG);
                //     i.CC_Yield=ccData[ccIdx].CC_Yield===null?' ':String(ccData[ccIdx].CC_Yield);
                // }
                i.CC_Check_in = ccIdx !== -1 ? ccData[ccIdx].CC_Check_in : null;
                i.CC_NG = ccIdx !== -1 ? ccData[ccIdx].CC_NG : null;
                i.CC_Yield = ccIdx !== -1 ? ccData[ccIdx].CC_Yield : null;

                const wpgIdx = wpgData.findIndex((o) => o.LotNum === i.lotnum);
                i.WPG_Check_in = wpgIdx !== -1 ? wpgData[wpgIdx].WPG_Check_in : null;
                i.WPG_NG = wpgIdx !== -1 ? wpgData[wpgIdx].WPG_NG : null;
                i.WPG_yield = wpgIdx !== -1 ? wpgData[wpgIdx].WPG_yield : null;

                const viIdx = viData.findIndex((o) => o.LotNum === i.lotnum);
                i.VI_Check_in = viIdx !== -1 ? viData[viIdx].VI_Check_in : null;
                i.VI_NG = viIdx !== -1 ? viData[viIdx].VI_NG : null;
                i.VI_Yield = viIdx !== -1 ? viData[viIdx].VI_Yield : null;

                const bumpIdx = bumpData.findIndex((o) => o.LotNum === i.lotnum);
                i.Bump_Check_in = bumpIdx !== -1 ? bumpData[bumpIdx].Bump_Check_in : null;
                i.Bump_NG = bumpIdx !== -1 ? bumpData[bumpIdx].Bump_NG : null;
                i.Bump_yield = bumpIdx !== -1 ? bumpData[bumpIdx].Bump_yield : null;

                // OSAT

                const bumposatIdx = bumposatData.findIndex((o) => o.LotNum === i.lotnum);
                i.Bump_Check_in = bumposatIdx !== -1 ? bumpData[bumposatIdx].Bump_Check_in : i.Bump_Check_in;
                i.Bump_NG = bumposatIdx !== -1 ? bumpData[bumposatIdx].Bump_NG : i.Bump_NG;
                i.Bump_yield = bumposatIdx !== -1 ? bumpData[bumposatIdx].Bump_yield : i.Bump_yield;

                const wpgosatIdx = wpgosatData.findIndex((o) => o.LotNum === i.lotnum);
                i.WPG_Check_in = wpgosatIdx !== -1 ? wpgosatData[wpgosatIdx].WPG_Check_in : i.WPG_Check_in;
                i.WPG_NG = wpgosatIdx !== -1 ? wpgosatData[wpgosatIdx].WPG_NG : i.WPG_NG;
                i.WPG_yield = wpgosatIdx !== -1 ? wpgosatData[wpgosatIdx].WPG_yield : i.WPG_yield;

                const viosatIdx = viosatData.findIndex((o) => o.LotNum === i.lotnum);
                i.VI_Check_in = viosatIdx !== -1 ? viosatData[viosatIdx].VI_Check_in : i.VI_Check_in;
                i.VI_NG = viosatIdx !== -1 ? viosatData[viosatIdx].VI_NG : i.VI_NG;
                i.VI_Yield = viosatIdx !== -1 ? viosatData[viosatIdx].VI_Yield : i.VI_Yield;

                if (i.CCcheck === 0) {///判斷沒有CC圖層
                    i.CC_Check_in = null;
                    i.CC_NG = null;
                    i.CC_Yield = null;
                }

                if (i.ProdClass !== "EMIB") {///判斷沒有EMIB BD
                    i.OST_BD_Check_in = null;
                    i.OST_BD_NG = null;
                    i.OST_BD_Yield = null;
                }

                // Product Yield
                i.Product_yield = i.OST_Yield *
                    (i.ProdClass !== "EMIB"
                        ? 1
                        : i.OST_BD_Yield) * //BD OST
                    (i.CCcheck === 0
                        ? 1
                        : i.CC_Yield) * //CC
                    i.WPG_yield *
                    i.VI_Yield *
                    i.Bump_yield
                // Product Yield

                // Inline_NG
                i.Inline_NG = i.In_Qnty - i.Out_Qnty - i.OST_NG -
                    (i.ProdClass !== "EMIB" ? 0 : i.OST_BD_NG) -
                    (i.CCcheck === 0 ? 0 : i.CC_NG) -
                    i.WPG_NG -
                    i.VI_NG -
                    i.Bump_NG < 0
                    ? 0
                    : i.In_Qnty - i.Out_Qnty - i.OST_NG -
                    (i.ProdClass !== "EMIB" ? 0 : i.OST_BD_NG) -
                    (i.CCcheck === 0 ? 0 : i.CC_NG) -
                    i.WPG_NG -
                    i.VI_NG -
                    i.Bump_NG;
                // Inline_NG

                // Inline_Yield
                i.Inline_NG === 0 ? i.Inline_yield = 1 : i.Inline_yield = 1 - (i.Inline_NG / i.In_Qnty)
                // Inline_Yield

                // OAY_Yield
                i.OAY_yield = i.Out_Qnty / i.In_Qnty
                // OAY_Yield

                // 將Remark資料補上
                if (delbeforeData.length > 0) {
                    const matchIdx = delbeforeData.findIndex((o) => o.LotNum === i.lotnum);
                    i.Remark = matchIdx !== -1 ? delbeforeData[matchIdx].Remark : '';
                } else {
                    i.Remark = '';
                };

                i.ChangeTime = String(i.ChangeTime).substring(0, 10) + ' ' + String(i.ChangeTime).substring(11, 19);
                i.partnum = i.PARTNO.substring(0, 7);

                // 刪除不用的屬性
                delete i.PARTNO;
                delete i.Count;
                delete i.CCcheck;
                delete i.IOTime;

                const keys = Object.keys(i);

                keys.forEach((k) => {
                    typeof i[k] === 'object'
                        ? i[k] = ''
                        : (k.slice(-5) === 'Yield' || k.slice(-5) === 'yield') && typeof i[k] === 'number'
                            ? i[k] = i[k].toFixed(4)
                            : typeof i[k] === 'number'
                                ? i[k] = String(i[k])
                                : true;
                });
            });

            res.json({ oaydata: { data: oayData, db: 'oay', table: 'oayyield' } });
        })
        .finally(() => {

            sql.close();
        })

});

router.get('/oayyieldt', (req, res) => {

    const curDate = new Date()
    let date = curDate.getDate();
    curDate.setHours(8, 0, 0, 0);
    let t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    const filterDayOfMonth = new Date(curDate.getFullYear(), date === 1 ? curDate.getMonth() - 1 : curDate.getMonth(), 1);
    filterDayOfMonth.setHours(0, 0, 0, 0);

    let l8sqlTime = filterDayOfMonth.toLocaleDateString() + ' ' + filterDayOfMonth.toTimeString().slice(0, 8);

    let oayData = [];
    let delbeforeData = [];
    let lotAry = [];
    let cccheckData = [];

    let ostData = [];
    let bdostData = [];
    let ccData = [];
    let bumpData = [];
    let viData = [];
    let wpgData = [];
    let ultbpData = [];

    let bumposatData = [];
    let viosatData = [];
    let wpgosatData = [];
    let connection;

    mysqlConnection(configFunc('oay'))
        .then((conn) => {
            connection = conn;
            const sqldata = `SELECT lotnum,Remark FROM oayyieldt WHERE ChangeTime >='${l8sqlTime}' AND Remark<>''`;
            return queryFunc(connection, sqldata)
        })
        .then((result) => {
            delbeforeData = result;
            const sqldata = `DELETE FROM oayyieldt WHERE ChangeTime >= '${l8sqlTime}'`;

            return queryFunc(connection, sqldata);
        })
        .then(() => {

            return poolAcme.query(`with lt as (
                Select DISTINCT c.IOTime,c.lotnum,c.partno,Case when ProdClass='CPU' then 'Client' else ProdClass end ProdClass,LotType,quan_sch In_Qnty,quan_prod  Out_Qnty,Notes='非併批' from PDL_CompleteLot_Yield(nolock) c  
                left join prodbasic(nolock)d on c.partno=Rtrim(d.PartNum)+Revision 
                left join (Select DISTINCT 批號,代碼 from V_RejectList where 代碼='K801')r on c.lotnum=r.批號
                where quan_sch IS NOT NULL AND 代碼 is null and Left(LotType,2) not in ('E3','R3','E4') and c.IOTime between '2024/5/1 08:00:00' and '${t8sqlTime}'
                Union
                SELECT DISTINCT IOTime,LotNum lotnum,RTrim(f.PartNum)+f.Revision partno,ProdClass,ITypeName LotType,QUAN_SCH In_Qnty,QUAN_PROD Out_Qnty,Notes from fin_oay f left join prodbasic(nolock)d on RTrim(f.PartNum)+f.Revision=Rtrim(d.PartNum)+d.Revision where Notes='被併批' and quan_sch IS NOT NULL and Left(ITypeName,2) not in ('E3','R3','E4') and IOTime between '2024/5/1 08:00:00'  and '${t8sqlTime}'),
    minmaxTimes as (
    SELECT lotnum,MIN(ChangeTime)MinTime,MAX(ChangeTime)MaxTime FROM (SELECT * FROM PDL_CKHistory(nolock) WHERE lotnum in (Select DISTINCT lotnum from lt)) dt Group by lotnum
    )
    SELECT DISTINCT Rtrim(lt.lotnum)lotnum,PARTNO,c.Count,ProdClass,LotType lot_type,In_Qnty,Out_Qnty,
                Case when Out_Qnty='0' and Count='1' then 'Div_Scrap' when Out_Qnty='0' then 'Prc_Scrap' else 'InStock' end type,
                Left(b.ProcName,3)+Cast(b.BefDegree As varchar)+Right(b.ProcName,3)+Cast(b.BefTimes As varchar) Beg_Prc,
                Left(e.ProcName,3)+Cast(e.BefDegree As varchar)+Right(e.ProcName,3)+Cast(e.BefTimes As varchar) End_Prc,
                convert(varchar, e.ChangeTime, 120)ChangeTime,convert(varchar, lt.IOTime, 120) IOTime FROM lt
                INNER JOIN (SELECT lotnum,Count(*)Count FROM PDL_CKHistory(nolock) WHERE lotnum IN (SELECT DISTINCT lotnum FROM lt) group by lotnum)c ON lt.lotnum=c.lotnum
                INNER JOIN (SELECT p.lotnum,ProcName,BefDegree,BefTimes,ChangeTime FROM PDL_CKHistory(nolock)p INNER JOIN ProcBasic b on p.ProcCode=b.ProcCode INNER JOIN minmaxTimes t ON p.lotnum=p.lotnum AND p.ChangeTime=t.MinTime WHERE p.lotnum IN (SELECT DISTINCT lotnum FROM lt)) b ON lt.lotnum=b.lotnum 
                 INNER JOIN (SELECT p.lotnum,ProcName,BefDegree,BefTimes,ChangeTime FROM PDL_CKHistory(nolock)p INNER JOIN ProcBasic b on p.ProcCode=b.ProcCode INNER JOIN minmaxTimes t ON p.lotnum=p.lotnum AND p.ChangeTime=t.MaxTime WHERE p.lotnum IN (SELECT DISTINCT lotnum FROM lt)) e ON lt.lotnum=e.lotnum 

                `)

        })
        .then((result) => {
            
            oayData = result.recordset.filter((i) => new Date(String(i.IOTime).substring(0, 10) + ' ' + String(i.IOTime).substring(11, 19)) >= new Date(l8sqlTime));

            lotStr = `'${result.recordset.map((i) => i.lotnum).join("','")}'`;
            partreStr = `'${result.recordset.map((i) => i.PARTNO).join("','")}'`;

            // wpg
            const wpgsqlStr = `Select T.lotnum LotNum,WPG_Check_in,case when SQnty is null then '0' else SQnty end WPG_NG,case when Round(1-(Cast(SQnty as real)/Cast(WPG_Check_in as real)),4) is null then '1' else Round(1-(Cast(SQnty as real)/Cast(WPG_Check_in as real)),4) end WPG_yield 
            from(SELECT  lotnum,Qnty WPG_Check_in from PDL_CKHistory(nolock)
                c where proccode ='FVI59' and BefStatus='MoveIn' and AftStatus='CheckIn' and lotnum in (${lotStr}))T 
            left join (Select  批號,SQnty from V_RejectList where 批號 in (${lotStr}) and 代碼='K600' and 製程站簡碼='FVIWPA')L on T.lotnum=L.批號`;

            // vi
            const visqlStr = `with dt as(Select  ChangeTime,lotnum,c.proccode,Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(AftDegree As varchar) eq_group,BefStatus,AftStatus,Decision,IsCancel,SQnty_S,Qnty_S,ROW_NUMBER() OVER (PARTITION BY lotnum Order BY ChangeTime) Rank from PDL_CKHistory(nolock) h inner join Procbasic c on h.proccode =c.ProcCode  
            where lotnum in (Select DISTINCT lotnum from PDL_CKHistory(nolock) h inner join Procbasic c on h.proccode =c.ProcCode where  ProcName='FVIVRS' and BefStatus='MoveIn' and AftStatus='CheckIn' and lotnum in (${lotStr})) 
            and (
            (BefStatus='CheckIn' and AftStatus='CheckOut' and 
            Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(BefTimes As varchar) in ('FVI1VRS1','FVI1FVI1','FVI1CVI1','FVI1FQC1','FVI1VRS2')) 
            OR
            (BefStatus='MoveIn' and AftStatus='CheckIn' and 
            Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(BefTimes As varchar) in ('FVI1VRS1'))
            )
            )
            Select s.lotnum LotNum,Qnty_S VI_Check_in,Scarp_sum from ((Select lotnum,Sum(SQnty_S)Scarp_sum from dt where IsCancel is null group by lotnum)s inner join (Select lotnum,Qnty_S from dt where Rank='1') m on s.lotnum=m.lotnum)`;

            // bump OSAT

            const bumpsqlosatStr = `with dt as (Select partnum,lotnum,Qnty_S,SQnty_S,BefStatus,AftStatus from PDL_CKHistory(nolock) h 
            inner join Procbasic c 
            on h.proccode =c.ProcCode  
            where Left(partnum,4)='6111' and  ProcName='FVIBUM' and lotnum in (${lotStr}))
                
            Select m.partnum,m.lotnum LotNum,Qnty_S Bump_Check_in,SQnty_S Bump_NG,Round((1-(CAST(SQnty_S AS REAL)/CAST(Qnty_S AS REAL))),4) Bump_yield from  
            (Select partnum,lotnum,Qnty_S from dt where BefStatus='MoveIn' and AftStatus='CheckIn')m 
            inner join
            (Select partnum,lotnum,SQnty_S from dt where BefStatus='CheckIn' and AftStatus='CheckOut')s
            on m.lotnum=s.lotnum`;

            // wpg OSAT

            const wpgsqlosatStr = `with dt as (Select partnum,lotnum,Qnty_S,SQnty_S,BefStatus,AftStatus from PDL_CKHistory(nolock) h 
            inner join Procbasic c 
            on h.proccode =c.ProcCode  
            where Left(partnum,4)='6111' and  ProcName='FVIWPG' and lotnum in (${lotStr}))
                
            Select m.partnum,m.lotnum LotNum,Qnty_S WPG_Check_in,SQnty_S WPG_NG,Round((1-(CAST(SQnty_S AS REAL)/CAST(Qnty_S AS REAL))),4) WPG_yield from  
            (Select partnum,lotnum,Qnty_S from dt where BefStatus='MoveIn' and AftStatus='CheckIn')m 
            inner join
            (Select partnum,lotnum,SQnty_S from dt where BefStatus='CheckIn' and AftStatus='CheckOut')s
            on m.lotnum=s.lotnum`;

            // vi OSAT

            const visqlosatStr = `with dt as (Select partnum,lotnum,ProcName,Qnty_S,SQnty_S,BefStatus,AftStatus from PDL_CKHistory(nolock) h 
            inner join Procbasic(nolock) c 
            on h.proccode =c.ProcCode  
            where   Left(partnum,4)='6111' and  ProcName in ('FVIAVI','FVIFQC','FVIFMP','FVIPCK') and lotnum in (${lotStr})
            OR Left(c.ProcName,3)+Cast(BefDegree As varchar)+Right(c.ProcName,3)+Cast(AftDegree As varchar) in ('FVI1FVI1','FVI1FVI2'))

            Select m.partnum,m.lotnum LotNum,Qnty_S VI_Check_in,SQnty_S VI_NG,Round((1-(CAST(SQnty_S AS REAL)/CAST(Qnty_S AS REAL))),4) VI_Yield from  
            (Select partnum,lotnum,Qnty_S from dt where ProcName='FVIAVI' and BefStatus='MoveIn' and AftStatus='CheckIn')m
            inner join 
            (Select lotnum,Sum(SQnty_S)SQnty_S from dt where ProcName<>'FVIAVI' and BefStatus='CheckIn' and AftStatus='CheckOut' group by lotnum)s
            on m.lotnum=s.lotnum`;

            const cccheckStr = `SELECT * FROM V_PnumProcRouteDtl(nolock)
            WHERE partnum+Revision in (${partreStr}) 
            and proccode='PSP23'`;

            return Promise.all([
                poolAcme.query(wpgsqlStr),
                poolAcme.query(visqlStr),
                poolAcme.query(bumpsqlosatStr),
                poolAcme.query(wpgsqlosatStr),
                poolAcme.query(visqlosatStr),
                poolAcme.query(cccheckStr),
            ]);
        })
        .then((resultAry) => {

            wpgData = resultAry[0].recordset;
            viData = resultAry[1].recordset;
            bumposatData = resultAry[2].recordset;
            wpgosatData = resultAry[3].recordset;
            viosatData = resultAry[4].recordset;
            cccheckData = resultAry[5].recordset;

            // ost
            const ostsqlStr = `with dt as(Select DISTINCT LotNum from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr}) and ScrappedSource in ('TST09'))
                        Select a.LotNum,Case when OST_NG is null then '0' else OST_NG end OST_NG,OST_Check_in,Case when OST_NG is null then '1' else Round((1-(Cast(OST_NG as real)/Cast(OST_Check_in as real))),4) end OST_Yield  from 
                        ( Select LotNum,Count(*)OST_Check_in from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr})  group by LotNum)a
                        inner join 
                        (Select LotNum,Count(*)OST_NG from YM_ULT_UnitBase(nolock) where LotNum in (Select LotNum from dt) and ScrappedSource in ('0 VRS','TST09') group by LotNum) d
                        on a.LotNum=d.LotNum`;

            // bdost
            const ostbdsqlStr = `with dt as(Select DISTINCT LotNum from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr}) and ScrappedSource in ('TST25'))
                        Select a.LotNum,Case when OST_BD_NG is null then '0' else OST_BD_NG end OST_BD_NG,OST_BD_Check_in,Case when OST_BD_NG is null then '1' else Round((1-(Cast(OST_BD_NG as real)/Cast(OST_BD_Check_in as real))),4) end OST_BD_Yield from 
                        ( Select LotNum,Count(*)OST_BD_Check_in from YM_ULT_UnitBase(nolock) where LotNum in (${lotStr})  group by LotNum)a
                        inner join 
                        (Select LotNum,Count(*)OST_BD_NG from YM_ULT_UnitBase(nolock) where LotNum in (Select LotNum from dt) and ScrappedSource in ('TST25') group by LotNum) d
                        on a.LotNum=d.LotNum`;

            // cc
            const ccsqlStr = `Select M.LotNum,Count_M CC_Check_in,CASE WHEN ULT_QTY IS NULL THEN 0 ELSE ULT_QTY END CC_NG,CASE WHEN ULT_QTY IS NULL THEN 1 ELSE Round((1-(Cast(ULT_QTY as real)/Cast(Count_M as real))),4) END CC_Yield from(Select LotNum,Count(*)Count_M from YM_ULT_UnitBase(nolock) 
                        where LotNum in (${lotStr}) group by LotNum)M 
                        left join (Select LotNum,Count(ScrappedSource) ULT_QTY from YM_ULT_UnitBase(nolock)  
                        where ScrappedSource in ('PSP23') Group by LotNum) U
                        on U.LotNum=M.LotNum`;

            // ult bp(TRA)
            const ultbpStr = `Select LotNum,Count(*)TRA from YM_ULT_UnitBase(nolock) where Scrapped='1' and ScrappedSource='FVI24' and LotNum in (${lotStr}) Group by LotNum`;

            return Promise.all([
                poolDc.query(ostsqlStr),
                poolDc.query(ostbdsqlStr),
                poolDc.query(ccsqlStr),
                poolDc.query(ultbpStr),
            ])
        })

        .then((resultAry) => {

            ostData = resultAry[0].recordset;
            bdostData = resultAry[1].recordset;
            ccData = resultAry[2].recordset;
            ultbpData = resultAry[3].recordset;

            const bumpsqlStr = `Select M.LotNum,count_m Bump_Check_in,Case when count is null then '0' else count end Bump_NG,Round(1-(Cast(case when count is null then '0' else count end as real)/Cast(count_m as real)),4) Bump_yield from (Select LotNum,Count(*) count_m from (SELECT LotNum,Defect,ROW_NUMBER() OVER (PARTITION BY LotNum,Panel,Unit_X,Unit_Y Order BY KeyDate desc) Rank
            from V_Bump_Unit_YM(nolock) where LotNum in (${lotStr}))T where Rank='1' group by LotNum)M left join (Select LotNum,Defect,Count(*) count from (SELECT LotNum,
            case when 
            (Defect is null or left(Defect,1)='J') then 'Bump_yield' else 'Bump_NG' end Defect,ROW_NUMBER() OVER (PARTITION BY LotNum,Panel,Unit_X,Unit_Y Order BY KeyDate desc) Rank
            from V_Bump_Unit_YM(nolock) where LotNum in (${lotStr}) and (Defect not in ('3D CirNG','2DID NG') or Defect is null))T where Rank='1' and Defect='Bump_NG' group by LotNum,Defect)T on M.LotNum=T.LotNum`;

            return poolMetrology.query(bumpsqlStr);
        })
        .then((result) => {

            bumpData = result.recordset;

            // 先把viData 補上 vibpData
            viData.forEach((i) => {
                const matchIdx = ultbpData.findIndex((o) => o.LotNum === i.LotNum);
                i.VI_NG = matchIdx !== -1 ? i.Scarp_sum + ultbpData[matchIdx].TRA : i.Scarp_sum;
                i.VI_Yield = Number((1 - (i.VI_NG / i.VI_Check_in)).toFixed(4));
            });

            oayData.forEach((i) => {

                // // IOTime 轉換 ChangeTime 如果相等則以ChangeTime 為主
                // i.IOTime === i.ChangeTime
                //     ? i.ChangeTime = i.ChangeTime
                //     : i.ChangeTime = i.IOTime;

                const checkIdx = cccheckData.findIndex((o) => (o.PartNum + o.Revision) === i.PARTNO);

                i.CCcheck = checkIdx !== -1 ? 1 : 0;

                const ostIdx = ostData.findIndex((o) => o.LotNum === i.lotnum);
                i.OST_NG = ostIdx !== -1 ? ostData[ostIdx].OST_NG : null;
                i.OST_Check_in = ostIdx !== -1 ? ostData[ostIdx].OST_Check_in : null;
                i.OST_Yield = ostIdx !== -1 ? ostData[ostIdx].OST_Yield : null;

                const bdostIdx = bdostData.findIndex((b) => b.LotNum === i.lotnum);
                i.OST_BD_NG = bdostIdx !== -1 ? bdostData[bdostIdx].OST_BD_NG : null;
                i.OST_BD_Check_in = bdostIdx !== -1 ? bdostData[bdostIdx].OST_BD_Check_in : null;
                i.OST_BD_Yield = bdostIdx !== -1 ? bdostData[bdostIdx].OST_BD_Yield : null;

                const ccIdx = ccData.findIndex((o) => o.LotNum === i.lotnum);
                // if(ccIdx !== -1){
                //     i.CC_Check_in=ccData[ccIdx].CC_Check_in===null?' ':String(ccData[ccIdx].CC_Check_in);
                //     i.CC_NG=ccData[ccIdx].CC_NG===null?' ':String(ccData[ccIdx].CC_NG);
                //     i.CC_Yield=ccData[ccIdx].CC_Yield===null?' ':String(ccData[ccIdx].CC_Yield);
                // }
                i.CC_Check_in = ccIdx !== -1 ? ccData[ccIdx].CC_Check_in : null;
                i.CC_NG = ccIdx !== -1 ? ccData[ccIdx].CC_NG : null;
                i.CC_Yield = ccIdx !== -1 ? ccData[ccIdx].CC_Yield : null;

                const wpgIdx = wpgData.findIndex((o) => o.LotNum === i.lotnum);
                i.WPG_Check_in = wpgIdx !== -1 ? wpgData[wpgIdx].WPG_Check_in : null;
                i.WPG_NG = wpgIdx !== -1 ? wpgData[wpgIdx].WPG_NG : null;
                i.WPG_yield = wpgIdx !== -1 ? wpgData[wpgIdx].WPG_yield : null;

                const viIdx = viData.findIndex((o) => o.LotNum === i.lotnum);
                i.VI_Check_in = viIdx !== -1 ? viData[viIdx].VI_Check_in : null;
                i.VI_NG = viIdx !== -1 ? viData[viIdx].VI_NG : null;
                i.VI_Yield = viIdx !== -1 ? viData[viIdx].VI_Yield : null;

                const bumpIdx = bumpData.findIndex((o) => o.LotNum === i.lotnum);
                i.Bump_Check_in = bumpIdx !== -1 ? bumpData[bumpIdx].Bump_Check_in : null;
                i.Bump_NG = bumpIdx !== -1 ? bumpData[bumpIdx].Bump_NG : null;
                i.Bump_yield = bumpIdx !== -1 ? bumpData[bumpIdx].Bump_yield : null;

                // OSAT

                const bumposatIdx = bumposatData.findIndex((o) => o.LotNum === i.lotnum);
                i.Bump_Check_in = bumposatIdx !== -1 ? bumpData[bumposatIdx].Bump_Check_in : i.Bump_Check_in;
                i.Bump_NG = bumposatIdx !== -1 ? bumpData[bumposatIdx].Bump_NG : i.Bump_NG;
                i.Bump_yield = bumposatIdx !== -1 ? bumpData[bumposatIdx].Bump_yield : i.Bump_yield;

                const wpgosatIdx = wpgosatData.findIndex((o) => o.LotNum === i.lotnum);
                i.WPG_Check_in = wpgosatIdx !== -1 ? wpgosatData[wpgosatIdx].WPG_Check_in : i.WPG_Check_in;
                i.WPG_NG = wpgosatIdx !== -1 ? wpgosatData[wpgosatIdx].WPG_NG : i.WPG_NG;
                i.WPG_yield = wpgosatIdx !== -1 ? wpgosatData[wpgosatIdx].WPG_yield : i.WPG_yield;

                const viosatIdx = viosatData.findIndex((o) => o.LotNum === i.lotnum);
                i.VI_Check_in = viosatIdx !== -1 ? viosatData[viosatIdx].VI_Check_in : i.VI_Check_in;
                i.VI_NG = viosatIdx !== -1 ? viosatData[viosatIdx].VI_NG : i.VI_NG;
                i.VI_Yield = viosatIdx !== -1 ? viosatData[viosatIdx].VI_Yield : i.VI_Yield;

                if (i.CCcheck === 0) {///判斷沒有CC圖層
                    i.CC_Check_in = null;
                    i.CC_NG = null;
                    i.CC_Yield = null;
                }

                if (i.ProdClass !== "EMIB") {///判斷沒有EMIB BD
                    i.OST_BD_Check_in = null;
                    i.OST_BD_NG = null;
                    i.OST_BD_Yield = null;
                }

                // Product Yield
                i.Product_yield = i.OST_Yield *
                    (i.ProdClass !== "EMIB"
                        ? 1
                        : i.OST_BD_Yield) * //BD OST
                    (i.CCcheck === 0
                        ? 1
                        : i.CC_Yield) * //CC
                    i.WPG_yield *
                    i.VI_Yield *
                    i.Bump_yield
                // Product Yield

                // Inline_NG
                i.Inline_NG = i.In_Qnty - i.Out_Qnty - i.OST_NG -
                    (i.ProdClass !== "EMIB" ? 0 : i.OST_BD_NG) -
                    (i.CCcheck === 0 ? 0 : i.CC_NG) -
                    i.WPG_NG -
                    i.VI_NG -
                    i.Bump_NG < 0
                    ? 0
                    : i.In_Qnty - i.Out_Qnty - i.OST_NG -
                    (i.ProdClass !== "EMIB" ? 0 : i.OST_BD_NG) -
                    (i.CCcheck === 0 ? 0 : i.CC_NG) -
                    i.WPG_NG -
                    i.VI_NG -
                    i.Bump_NG;
                // Inline_NG

                // Inline_Yield
                i.Inline_NG === 0 ? i.Inline_yield = 1 : i.Inline_yield = 1 - (i.Inline_NG / i.In_Qnty)
                // Inline_Yield

                // OAY_Yield
                i.OAY_yield = i.Out_Qnty / i.In_Qnty
                // OAY_Yield

                // 將Remark資料補上
                if (delbeforeData.length > 0) {
                    const matchIdx = delbeforeData.findIndex((o) => o.LotNum === i.lotnum);
                    i.Remark = matchIdx !== -1 ? delbeforeData[matchIdx].Remark : '';
                } else {
                    i.Remark = '';
                };

                i.ChangeTime = String(i.ChangeTime).substring(0, 10) + ' ' + String(i.ChangeTime).substring(11, 19);
                i.IOTime = String(i.IOTime).substring(0, 10) + ' ' + String(i.IOTime).substring(11, 19);
                i.partnum = i.PARTNO.substring(0, 7);

                // 刪除不用的屬性
                delete i.PARTNO;
                delete i.Count;
                delete i.CCcheck;
                // delete i.IOTime;

                const keys = Object.keys(i);

                keys.forEach((k) => {
                    typeof i[k] === 'object'
                        ? i[k] = ''
                        : (k.slice(-5) === 'Yield' || k.slice(-5) === 'yield') && typeof i[k] === 'number'
                            ? i[k] = i[k].toFixed(4)
                            : typeof i[k] === 'number'
                                ? i[k] = String(i[k])
                                : true;
                });

            });
            // res.json(oayData)
            res.json({ oaydata: { data: oayData, db: 'oay', table: 'oayyieldt' } });
        })
        .catch((err) => {
            console.log(err);
        })

});

// router.delete('/oayyield', (req, res) => {

//     const curDate = new Date()
//     const filterDayOfMonth = new Date(curDate.getFullYear(), curDate.getMonth(), 1);
//     filterDayOfMonth.setHours(0, 0, 0, 0);
//     const l8sqlTime = filterDayOfMonth.toLocaleDateString() + ' ' + filterDayOfMonth.toTimeString().slice(0, 8);

//     return new new Promise((resolve, reject) => {
//         mysqlConnection(configFunc('oay'))
//             .then((connection) => {
//                 const sqldata = `DELETE FROM oayyield WHERE ChangeTime >= '${l8sqlTime}'`;
//                 return queryFunc(connection, sqldata)
//             })
//             .then((result) => {
//                 console.log(`刪除大於${l8sqlTime}所有資料`);
//                 resolve();
//             })
//             .catch((err) => {
//                 console.log(err);
//                 reject();
//             });
//     })
// });


module.exports = router;

