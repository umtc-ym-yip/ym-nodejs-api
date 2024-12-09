const express = require('express');
const sql = require('mssql');

const dailyApi = express.Router();

dailyApi.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

const curDate = new Date()
curDate.setHours(8, 0, 0, 0);
const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

curDate.setDate(curDate.getDate() - 1);
curDate.setHours(8, 0, 0, 0);
const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

const configAcme = {
    server: '10.22.65.120',
    user: 'dc',
    password: 'dc',
    database: 'acme',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 300000
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
    }
};


dailyApi.get('/ccstack', async (req, res) => {
    try {
        res.json([{ 'number': '1', 'String': '2' }, { 'number': '7', 'String': '8' }, { 'number': '9', 'String': '18' }]);
    } catch (error) {
        console.log('報錯', error);
    }
});

dailyApi.get('/bumpstack', async (req, res) => {
    try {
        res.json([{ 'lot': '123', 'layer': '456', 'id': 1, 'number': '3', 'String': '4' },
        { 'lot': 'aaa', 'layer': 'bbb', 'id': 1, 'number': '6', 'String': '6' }]);
    } catch (error) {
        console.log('報錯', error);
    }
});


dailyApi.get('/bumpstackt', async (req, res) => {
    try {
        res.json([{ 'lot': '123', 'layer': '456', 'id': '1', 'number': '99', 'String': '99' },
        { 'lot': 'aaa', 'layer': 'bbb', 'id': 1, 'number': '77', 'String': '77' },
        { 'lot': 'bbb', 'layer': 'bbb', 'id': 1, 'number': '77', 'String': '77' }]);
    } catch (error) {
        console.log('報錯', error);
    }
});

dailyApi.get('/wpgdaily', async (req, res) => {
    try {
        const poolAcme = await sql.connect(configAcme);
        

        const result1 = await poolAcme.request().query(`SELECT DISTINCT b.ProdClass,p.partnum,p.lotnum,t.ITypeName,p.ChangeTime 
        from PDL_CKhistory(nolock)p 
        inner join 
        ClassIssType(nolock)t 
            on p.isstype=t.ITypeCode
        inner join ProdBasic(nolock) b
            on Left(p.partnum,7)=Left(b.PartNum,7)
        where Left(p.partnum,1)!='U' 
        and proccode='FVI59' 
        and BefStatus='CheckIn' 
        and AftStatus='Checkout'
        and IsCancel is null 
        and ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'`);

        if(result1.recordset.length===0){
            return res.json([])
        }

        const lotStr = result1.recordset.map((i) => `'${i.lotnum}'`).join(',');

        await poolAcme.close();

        const poolDc = await sql.connect(configDc);
        const result2 = await poolDc.request().query(`with dt as 
        (Select * from 
        (SELECT  Left(PartNum,7)PN,LotNum,Unit_Decision,[2D_Barcode],ROW_NUMBER() OVER (PARTITION BY LotNum,[2D_Barcode] ORDER BY 
        CASE WHEN Unit_Result IN ('Pass','Surfacefail','Land2Dfail','Component2Dfail') THEN 0 ELSE 1 END ASC)Rank,case when Unit_Result in ('Pass','Surfacefail','Land2Dfail','Component2Dfail') then 'Pass' else Unit_Result end Unit_Result 
        from YM_ULT_FVIWPG_LogRawdata where LotNum in (${lotStr}))T
        where Rank='1')

        Select DISTINCT LotNum,totalCount,Yield,[2DMatrixfail],Land3Dfail,Invalidfail
        from 
        (SELECT T.LotNum,CASE WHEN Unit_Result='Pass' then 'Yield' else Unit_Result end Unit_Result
        ,totalCount,Round(Cast(Count as real)/Cast(totalCount as real),4)Rate 
        from 
        (SELECT LotNum,Unit_Result,Count(*)Count from dt GROUP BY LotNum,Unit_Result)T
            INNER JOIN (Select Lotnum,Count(*)totalCount from dt GROUP BY LotNum) M 
        on T.LotNum=M.LotNum)t PIVOT (Max(Rate) FOR Unit_Result in ([Yield],[2DMatrixfail],[Land3Dfail],[Invalidfail]))k 
        `);
        await poolDc.close();
        

        result2.recordset.forEach((i)=>{
            const matchIdx=result1.recordset.findIndex((o)=>o.lotnum===i.LotNum);
            if(matchIdx===-1){
                i.ProdClass=null;
                i.PartNum=null;
                i.LotType=null;
                i.ChangeTime=null;
            }else{
                const time=result1.recordset[matchIdx]['ChangeTime'].toISOString();
                i.ProdClass=result1.recordset[matchIdx]['ProdClass'];
                i.PartNum=result1.recordset[matchIdx]['partnum'];
                i.LotType=result1.recordset[matchIdx]['ITypeName'];
                i.ChangeTime=time.slice(0,10)+' '+time.slice(11,19);
            }
            i.Remark=null;
        });

        res.json(result2.recordset)

        // sql.connect(configacme, (err) => {
        //     if (err) { console.log('wpgdaily connect err', err) } else {
        //         const request = new sql.Request();

        //         request.query(`SELECT DISTINCT b.ProdClass,p.partnum,p.lotnum,t.ITypeName,p.ChangeTime 
        //         from PDL_CKhistory(nolock)p 
        //         inner join 
        //         ClassIssType(nolock)t 
        //             on p.isstype=t.ITypeCode
        //         inner join ProdBasic(nolock) b
        //             on Left(p.partnum,7)=Left(b.PartNum,7)
        //         where Left(p.partnum,1)!='U' 
        //         and proccode='FVI59' 
        //         and BefStatus='CheckIn' 
        //         and AftStatus='Checkout'
        //         and IsCancel is null 
        //         and ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'`, (err, recordset) => {


        //             if (err) { console.log('wpgdaily sql err', err) } else {
        //                 res.json(recordset.recordset);
        //             }
        //         })
        //     }
        // });
    } catch (err) {
        console.log('wpgdaily api err', err)
    }
});

dailyApi.get('/ccdaily', async (req, res) => {
    try {
        const poolAcme = await sql.connect(configAcme);
        const result1 = await poolAcme.request().query(`
        SELECT DISTINCT ProdClass type,Left(m.partnum,7)partno,lotnum lotno,t.ITypeName lot_type,ChangeTime Time,mc.MachineName Machine 
        from PDL_CKHistory(nolock)m inner join
        PDL_Machine(nolock) mc 
        on m.Machine = mc.MachineId inner join
        ClassIssType(nolock)t
        on m.isstype=t.ITypeCode 
        inner join prodbasic(nolock) b 
        on b.PartNum = m.partnum and b.Revision=m.revision 
        where proccode in ('PSP23')
        and BefStatus in ('CheckIn')
        and AftStatus in ('CheckOut')
        and ChangeTime between '${l8sqlTime}' and '${t8sqlTime}'`);


        if(result1.recordset.length===0){
            return res.json([])
        }


        const lotStr = result1.recordset.map((i) => `'${i.lotnum}'`).join(',');

        result1.recordset.forEach((i)=>{
            const time=i.Time.toISOString();
            i.Time=time.slice(0,10)+' '+time.slice(11,19);
        });

        await poolAcme.close();

        const poolDc = await sql.connect(configDc);
        const result2 = await poolDc.request().query(
            `Select * from (Select T.LN, T.[VRS Judge],Count_m Unit,Sum(Round((Cast(Count as real)/Cast(Count_m As real)),4))Rate
            from (Select LN,Case when [VRS Judge]='Good' OR [VRS Judge]='Pass' then 'Yield' when InspType='Missing' then 'T15' else 'T44' end [VRS Judge],Count([VRS Judge])Count from YM_CCAOI_RawData 
            where LN in (${lotStr}) and [VRS Judge] in ('Good','NG','Pass') Group by LN,[VRS Judge],InspType)T inner join 
            (Select LN,Count(*)Count_m  from YM_CCAOI_RawData 
            where LN in (${lotStr}) and [VRS Judge] in ('Good','NG','Pass') Group by LN)M on T.LN=M.LN Group by T.LN,T.[VRS Judge],M.Count_m)t Pivot (MAX(Rate) For [VRS Judge] in ([Yield],[T44],[T15]))k`
        );

        result1.recordset.forEach((i)=>{
            const matchIdx=result2.recordset.findIndex((o)=>i.lotno===o.LN);
            if(matchIdx===-1){
                i.Unit=null;
                i.Yield=null;
                i.T44=null;
                i.T15=null
            }else{
                i.Unit=result2.recordset[matchIdx]['Unit'];
                i.Yield=result2.recordset[matchIdx]['Yield'];
                i.T44=result2.recordset[matchIdx]['T44'];
                i.T15=result2.recordset[matchIdx]['T15'];
                
            }
            i.Remark=null;

        });

        res.json(result1.recordset);

    } catch (error) {
        console.log('ccdaily api err',error)
    }
})

module.exports = dailyApi