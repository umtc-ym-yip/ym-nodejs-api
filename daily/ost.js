const express = require('express');
const sql = require('mssql');
const { timestampToYMDHIS } = require('../time');
const { poolAcme, poolDc, poolNCN } = require('../mssql');
const { mysqlConnection, queryFunc } = require('../mysql');
const { configFunc } = require('../config.js');

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/dailyadd', (req, res) => {

    const curDate = new Date()
    curDate.setHours(8, 0, 0, 0);
    const t8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);

    curDate.setDate(curDate.getDate() - 1);
    curDate.setHours(8, 0, 0, 0);
    const l8sqlTime = curDate.toLocaleDateString() + ' ' + curDate.toTimeString().slice(0, 8);
    // console.log('l8sqlTime',l8sqlTime)
    // console.log('t8sqlTime',t8sqlTime)
    let readoutDataAry = [];
    let twogigpartAry = [];
    let triggerAry = [];
    let dftriggerAry = [];
    ///1.每日產出批
    const sqlReadout = `SELECT s.ULMark94V,s.ProdClass,LEFT(a.partnum,8) part_number,a.revision,LEFT(a.lotnum,11)LotBase,lotnum,d.ITypeName lot_type,convert(varchar, a.ChangeTime, 120) Check_out_time,a.Qnty lot_unit,b.ProcName eq_group,SUBSTRING(b.ProcName,1,3)+CAST(BefDegree as nvarchar)+SUBSTRING(b.ProcName,4,3)+CAST(BefTimes as nvarchar) step,
    CASE WHEN LEFT(b.ProcName,6)='TSTMPW' THEN 'MP' ELSE 'BD' END Type
    FROM acme.dbo.pdl_ckhistory a(nolock)
    INNER JOIN acme.dbo.numoflayer f(nolock) ON a.layer = f.Layer 
    INNER JOIN acme.dbo.ClassIssType d(nolock) ON a.isstype = d.ITypeCode
    INNER JOIN acme.dbo.procbasic b(nolock) ON a.proccode = b.ProcCode
    INNER JOIN acme.dbo.PDL_Machine e(nolock) ON a.machine=e.machineid
    INNER JOIN acme.dbo.prodbasic s(nolock) ON left(a.partnum,8)=s.PartNum AND a.revision=s.Revision 
    WHERE AftStatus='CheckOut' 
    AND s.Layer='0'
    AND a.ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'  
    AND LEFT(b.ProcName,6) IN ('TSTMPW','TSTBDT')
    ORDER BY ChangeTime`;

    const sqltwoGig = `SELECT DISTINCT PartNum FROM YM_OST_SUB_Receipe`;
    const sqlTrigger = `SELECT ShortPart,[0001] target,[0001_L] triger FROM 
    (Select * from YM_OST_Panel_Yield_Trigger(nolock)) AS p PIVOT (MAX([TriggerValue]) for BinSet in ([0001],[0001_L]))T`;
    const sqldfTrigger = `SELECT ShortPart,[0007] Bin7_tri,[0008] Bin8_tri,[0010] Bin10_tri,[0021] Bin21_tri,[0022] Bin22_tri,[0023] Bin23_tri,[0031] Bin31_tri,[0032] Bin32_tri,[0033] Bin33_tri,[0091] Bin91_tri,[0092] Bin92_tri,[0099] Bin99_tri FROM 
    (Select ShortPart,Case when BinSet='0091&9120' then '0091'  else BinSet end BinSet,TriggerValue from YM_Ost_Ncn_Trigger(nolock)) AS p PIVOT (MAX([TriggerValue]) for 
    BinSet in ([0007],[0008],[0010],[0021],[0022],[0023],[0031],[0032],[0033],[0091],[0092],[0099]) )P`;

    Promise.all([
        poolAcme.query(sqlReadout),
        poolDc.query(sqltwoGig),
        poolDc.query(sqlTrigger),
        poolDc.query(sqldfTrigger)
    ])
        .then((result) => {
            // res.json(result)
            // aaa
            // console.log(result)
            const promiseAry = [];
            const conditionAry = ['BD', 'MP_2Gig', 'MP_1Gig'];

            readoutDataAry = result[0].recordset;

            twogigpartAry = result[1].recordset.map((i) => i.PartNum);
            triggerAry = result[2].recordset;
            dftriggerAry = result[3].recordset;

            // 分出Bridge Die/MP 資料
            const eqgroupData = result[0].recordset.map((i) => ({ eq_group: i.eq_group, lot: i.lotnum, part: i.part_number.substring(0, 7) }));

            conditionAry.forEach((i) => {

                let twoGigFilter = '';
                let ostIndexTable = '';
                let Type = '';
                let lotStr = '';

                if (i === 'MP_2Gig') {
                    twoGigFilter = `AND ProcCode='TST09'`;
                    ostIndexTable = 'YM_OST_EMIB_Index_Table';
                    Type = 'MP';
                    lotStr = `'${eqgroupData.filter((i) => i.eq_group === 'TSTMPW' && twogigpartAry.includes(i.part)).map((i) => i.lot).join("','")}'`;

                } else if (i === 'BD') {
                    twoGigFilter = `AND ProcCode='TST25'`;
                    ostIndexTable = 'YM_OST_EMIB_Index_Table';
                    Type = 'BD';
                    lotStr = `'${eqgroupData.filter((i) => i.eq_group === 'TSTBDT').map((i) => i.lot).join("','")}'`;

                } else {
                    twoGigFilter = '';
                    ostIndexTable = 'YM_OST_Index_Table';
                    Type = 'MP';
                    lotStr = `'${eqgroupData.filter((i) => i.eq_group === 'TSTMPW' && !(twogigpartAry.includes(i.part))).map((i) => i.lot).join("','")}'`;

                };

                // CASE  WHEN NgBin IS NULL THEN '0001'
                let sqlOst = `SELECT Type='${Type}',T.PartNo,T.AcmeLot,CAST(T.BoardNo AS REAL)BoardNo,Panel_X,Panel_Y,T.VrsCode,
                CASE  WHEN NgBin IS NULL THEN '0001' ELSE NgBin END NgBin,T.NCN,U.Scrapped,U.Repair FROM (SELECT LEFT(u.CenterPart,7)PartNo,r.AcmeLot,Substring(r.[2D_ID],12,2)BoardNo,u.Panel_X,u.Panel_Y,u.VrsCode,r.NgBin,n.Classify+'-'+Ltrim(Str(n.SubClassifyID))NCN FROM 
                ${ostIndexTable}(nolock)r
                LEFT JOIN YM_ULT_UnitBase(nolock)u ON r.[2D_ID]=u.[MPID] AND r.X=u.MP_X and r.Y=u.MP_Y
                LEFT JOIN YM_NCN_Kill_Unit(nolock)n ON r.AcmeLot= n.LotNum AND Str(Cast(Substring(r.[2D_ID],12,2)As real))=Str(n.BoardNo) AND u.VrsCode=n.VrsCode
                WHERE r.AcmeLot IN (${lotStr}) AND (u.ScrappedSource<>'FLIVRS' OR u.ScrappedSource IS NULL)${twoGigFilter})
                T 
                LEFT JOIN
                (SELECT  LotNum,BoardNo,VrsCode,Max(Cast(Scrapped As real))Scrapped,Max(Cast(Repair As real))Repair FROM YM_VRS_Test_Result a(nolock)
                    WHERE LotNum IN (${lotStr}) AND (Scrapped='1' or Repair='1') GROUP BY LotNum,BoardNo,VrsCode
                )
                U
                ON T.AcmeLot=U.LotNum AND T.BoardNo=U.BoardNo AND T.VrsCode=U.VrsCode
                `;

                


                promiseAry.push(poolDc.query(sqlOst))

            });

            return Promise.all(promiseAry)
        })
        .then((resultAry) => {
            
            const ngbinAry = [
                { number: '0001', column: 'Yield' },
                { number: '0008', column: 'Bin08' },
                { number: '0010', column: 'Bin10' },
                { number: '0007', column: 'Bin07' },
                { number: '0021', column: 'Bin21' },
                { number: '0022', column: 'Bin22' },
                { number: '0023', column: 'Bin23' },
                { number: '0031', column: 'Bin31' },
                { number: '0032', column: 'Bin32' },
                { number: '0033', column: 'Bin33' },
                { number: '0091', column: 'Bin91' },
                { number: '0092', column: 'Bin92' },
                { number: '0099', column: 'Bin99' }
            ];
            const bin99_skip_rule = ['A1-50', 'A1-52'];
            let ostData = [];
            const finalData = [];

            resultAry.forEach((i) => {///篩選計算良率/不良率的data
                const data = i.recordset.filter((i) => /// BD的NgBin!=='0099'
                    (
                        i.Type === 'MP'
                        &&
                        (
                            i.NgBin !== '0099'
                            ||
                            i.NgBin === '0099' && (bin99_skip_rule.includes(i.NCN) || i.NCN === null)
                        )
                    )
                    ||
                    (
                        i.Type === 'BD'
                        &&
                        i.NgBin !== '0099'
                    )

                );
                ostData = [...ostData, ...data];
            });

            const lotAry = [...new Set(ostData.map((i) => i.PartNo + '_' + i.AcmeLot + '_' + i.Type))];

            lotAry.forEach((l) => {
                const lotItem = l.split('_');
                const Obj = {};

                // Obj.partno = lotItem[0]
                Obj.lotno = lotItem[1];
                Obj.type = lotItem[2];

                const matchData = ostData.filter((o) => o.AcmeLot === lotItem[1] && o.Type === lotItem[2]);
                Obj.units = matchData.length;
                ngbinAry.forEach((n) => {
                    const totalCount = matchData.length;
                    const filterData = matchData.filter((i) => i.NgBin === n.number);
                    const ngBinCount = filterData.length;
                    if (n.number === '0031') {////分出0031_aoi 0031_aos 0031_clear

                        const aoi0031Count = filterData.filter((i) => i.NgBin === '0031' && i.Scrapped === 1 ).length;///0031_aoi
                        const aos0031Count = filterData.filter((i) => i.NgBin === '0031' && i.Scrapped === 0 && i.Repair === 1).length;///0031_aoi
                        const clear0031Count = filterData.filter((i) => (i.NgBin === '0031' && i.Scrapped === null) || (i.NgBin === '0031' && i.Scrapped === 0 && i.Repair === 1)).length;///0031_aoi

                        Obj['Bin31_aoi'] = (aoi0031Count / totalCount).toFixed(4);
                        Obj['Bin31_aos'] = (aos0031Count / totalCount).toFixed(4);
                        Obj['Bin31_clear'] = (clear0031Count / totalCount).toFixed(4);
                    }
                    Obj[n.column] = (ngBinCount / totalCount).toFixed(4);
                });

                finalData.push(Obj);
            });

            finalData.forEach((i) => {

                const readoutIndex = readoutDataAry.findIndex((x) => x.lotnum === i.lotno && x.Type === i.type);
               

                if (readoutIndex !== -1) {
                    const { ULMark94V,part_number, ProdClass, lot_type, Check_out_time, lot_unit, eq_group, step } = readoutDataAry[readoutIndex];
                    i.partno=part_number.substring(0,7);
                    i.ULMark94V = ULMark94V;
                    i.ProdClass = ProdClass;
                    i.lot_type = lot_type;
                    i.checkouttime = String(Check_out_time).substring(0, 4) + '/' + String(Check_out_time).substring(5, 7) + '/' + String(Check_out_time).substring(8, 10) + ' ' + String(Check_out_time).substring(11, 19);
                    // i.units = String(lot_unit);
                } else {
                    i.partno='';
                    i.ULMark94V = '';
                    i.ProdClass = '';
                    i.lot_type = '';
                    i.checkouttime = '';
                    // i.units = '';
                };

                const triggerIndex = triggerAry.findIndex((x) => x.ShortPart === i.partno); ////目前MP跟BD的Target/Trigger一樣
                const dftriggerIndex = dftriggerAry.findIndex((x) => x.ShortPart === i.partno);////目前MP跟BD的Target/Trigger一樣

                if (triggerIndex !== -1) {
                    const { target, triger } = triggerAry[triggerIndex];
                    i.target = target === null ? ' ' : target.toFixed(4);
                    i.triger = triger === null ? ' ' : triger.toFixed(4);
                    i.Tri = i.Yield - i.triger >= 0 ? '0' : '1';
                } else {
                    i.target = '';
                    i.triger = '';
                    i.Tri = '';
                };

                if (dftriggerIndex !== -1) {
                    const {
                        Bin7_tri, Bin8_tri, Bin10_tri, Bin21_tri, Bin22_tri, Bin23_tri, Bin31_tri, Bin32_tri, Bin33_tri, Bin91_tri, Bin92_tri, Bin99_tri
                    } = dftriggerAry[dftriggerIndex];

                    i.Bin7_tri = Bin7_tri === null ? ' ' : Bin7_tri.toFixed(4);
                    i.Bin8_tri = Bin8_tri === null ? ' ' : Bin8_tri.toFixed(4);
                    i.Bin10_tri = Bin10_tri === null ? ' ' : Bin10_tri.toFixed(4);
                    i.Bin21_tri = Bin21_tri === null ? ' ' : Bin21_tri.toFixed(4);
                    i.Bin22_tri = Bin22_tri === null ? ' ' : Bin22_tri.toFixed(4);
                    i.Bin23_tri = Bin23_tri === null ? ' ' : Bin23_tri.toFixed(4);
                    i.Bin31_tri = Bin31_tri === null ? ' ' : Bin31_tri.toFixed(4);
                    i.Bin32_tri = Bin32_tri === null ? ' ' : Bin32_tri.toFixed(4);
                    i.Bin33_tri = Bin33_tri === null ? ' ' : Bin33_tri.toFixed(4);
                    i.Bin91_tri = Bin91_tri === null ? ' ' : Bin91_tri.toFixed(4);
                    i.Bin92_tri = Bin92_tri === null ? ' ' : Bin92_tri.toFixed(4);
                    i.Bin99_tri = Bin99_tri === null ? ' ' : Bin99_tri.toFixed(4);

                } else {
                    i.Bin7_tri = '';
                    i.Bin8_tri = '';
                    i.Bin10_tri = '';
                    i.Bin21_tri = '';
                    i.Bin22_tri = '';
                    i.Bin23_tri = '';
                    i.Bin31_tri = '';
                    i.Bin32_tri = '';
                    i.Bin33_tri = '';
                    i.Bin91_tri = '';
                    i.Bin92_tri = '';
                    i.Bin99_tri = '';
                };

                i.Remark = '';
                i.series = i.lotno;

            });

            res.json({
                ostreadout: { data: finalData, db: 'paoi', table: 'ostyield',match:[
                    "ULMark94V",
                    "ProdClass",
                    "partno",
                    "lot_type",
                    "units",
                    "checkouttime",
                    "Yield",
                    "target",
                    "triger",
                    "Tri",
                    // "Remark",
                    "series",
                    "Bin07",
                    "Bin08",
                    "Bin10",
                    "Bin21",
                    "Bin22",
                    "Bin23",
                    "Bin31",
                    "Bin32",
                    "Bin33",
                    "Bin91",
                    "Bin92",
                    "Bin99",
                    "Bin31_clear",
                    "Bin31_aoi",
                    "Bin31_aos",
                    "Bin7_tri",
                    "Bin8_tri",
                    "Bin10_tri",
                    "Bin21_tri",
                    "Bin22_tri",
                    "Bin23_tri",
                    "Bin31_tri",
                    "Bin32_tri",
                    "Bin33_tri",
                    "Bin91_tri",
                    "Bin92_tri",
                    "Bin99_tri"
                ] },
            });

        })
        .catch((err) => {
            console.log(err);
        })
});




router.get('/weeklystack', (req, res) => {

    ///1.先連至mysql抓當周資料待更新用
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {

            const sqlWeek = `SELECT CASE WHEN type='BD' THEN 'TSTBDT' ELSE 'TSTMPW' END eq_group,
            type,ProdClass,CASE WHEN
            LENGTH(CAST(Week(checkouttime)+1 AS char))=1 THEN  
            CAST(Concat(CAST(Year(checkouttime)AS char),'0',CAST(Week(checkouttime)+1 AS char)) AS real) 
            ELSE 
            CAST(Concat(CAST(Year(checkouttime)AS char),CAST(Week(checkouttime)+1 as char))AS real) END Week
            ,checkouttime,partno,lotno,lot_type,units,Yield,Bin07,Bin08,Bin10,Bin21,Bin22,Bin23,Bin31,Bin31_clear,Bin31_aoi,Bin31_aos,Bin32,Bin33,Bin91,Bin92,Bin99 FROM ostyield 
            WHERE LEFT(partno,4)<>'UMGL' AND LEFT(lot_type,2) NOT IN ('E3')`;

            const sqltwoGig = `SELECT DISTINCT PartNum FROM YM_OST_SUB_Receipe`;

            return Promise.all([queryFunc(connection, sqlWeek), poolDc.query(sqltwoGig)])
        })
        .then((result) => {
            ////分出個別 Type/料號/ 週別
            // const isTotal = true;
            const promiseAry = [];
            // const conditionAry = ['BD', 'MP_2Gig', 'MP_1Gig'];
            const weekStart = 0;
            const weekEnd = 2;
            // 更新兩週

            const mptwoGigPart = result[1].recordset.map((i) => i.PartNum);

            // if (isTotal) {

            const testAry = result[0].map((i) => ({ Week: i.Week, Part: i.partno, Type: i.eq_group === 'TSTMPW' ? 'MP' : 'BD' }));
            const testAry2 = [...new Set(result[0].map((i) => i.partno + '_' + (i.eq_group === 'TSTMPW' ? 'MP' : 'BD')))];

            const groupAry = [];
            testAry2.forEach((i) => {
                const filterAry = i.split('_');
                const Obj = {};
                Obj.part = filterAry[0];
                Obj.type = filterAry[1];
                Obj.weekAry = [];

                testAry.forEach((t) => {

                    t.Part === filterAry[0] && t.Type === filterAry[1]
                        ? Obj.weekAry.push(t.Week)
                        : true;
                });

                Obj.weekAry = [...new Set(Obj.weekAry)].sort((a, b) => b - a);
                groupAry.push(Obj);

            });

            groupAry.forEach((g) => {

                const weekAry = g.weekAry.slice(weekStart, weekEnd);

                weekAry.forEach((w) => {

                    let condition = (g.type === 'MP' && mptwoGigPart.includes(g.part))
                        ? 'MP_2Gig'
                        : g.type === 'BD'
                            ? 'BD'
                            : 'MP_1Gig';

                    let twoGigFilter = condition === 'MP_2Gig'
                        ? `AND ProcCode='TST09'`
                        : condition === 'BD'
                            ? `AND ProcCode='TST25'`
                            : '';

                    let ostIndexTable = condition === 'MP_2Gig' || condition === 'BD'
                        ? 'YM_OST_EMIB_Index_Table'
                        : 'YM_OST_Index_Table';

                    let Type = g.type;

                    let lotStr = condition === 'MP_2Gig'
                        ? `'${result[0].filter((i) => i.type === 'MP' && i.Week === w && i.partno === g.part && mptwoGigPart.includes(g.part)).map((i) => i.lotno).join("','")}'`
                        : condition === 'BD'
                            ? `'${result[0].filter((i) => i.type === 'BD' && i.Week === w && i.partno === g.part).map((i) => i.lotno).join("','")}'`
                            : `'${result[0].filter((i) => i.type === 'MP' && i.Week === w && i.partno === g.part && !mptwoGigPart.includes(g.part)).map((i) => i.lotno).join("','")}'`;

                    let sqlOst = `SELECT Week='${w}',Type='${Type}',PartNo='${g.part}',T.AcmeLot,CAST(T.BoardNo AS REAL)BoardNo,Panel_X,Panel_Y,T.VrsCode,
                    CASE  WHEN NgBin IS NULL THEN '0001' ELSE NgBin END NgBin,T.NCN,U.Scrapped,U.Repair FROM 
                    (SELECT LEFT(u.CenterPart,7)PartNo,r.AcmeLot,Substring(r.[2D_ID],12,2)BoardNo,u.Panel_X,u.Panel_Y,u.VrsCode,r.NgBin,n.Classify+'-'+Ltrim(Str(n.SubClassifyID))NCN 
                    FROM
                    
                    (SELECT [2D_ID],X,Y,NgBin,AcmeLot FROM ${ostIndexTable}(nolock) WHERE AcmeLot IN　(${lotStr}))r
                    
                    LEFT JOIN 
                    
                    (SELECT CenterPart,LotNum,[MPID],MP_X,MP_Y,Panel_X,Panel_Y,VrsCode,ScrappedSource FROM YM_ULT_UnitBase(nolock) WHERE LotNum IN (${lotStr}))u
                    
                    ON r.[2D_ID]=u.[MPID] AND r.X=u.MP_X and r.Y=u.MP_Y
                    
                    LEFT JOIN YM_NCN_Kill_Unit(nolock)n
                    
                    ON 
                    r.AcmeLot= n.LotNum 
                    AND Str(Cast(Substring(r.[2D_ID],12,2)As real))=Str(n.BoardNo) 
                    AND u.VrsCode=n.VrsCode
                    
                    WHERE (u.ScrappedSource<>'FLIVRS' OR u.ScrappedSource IS NULL))T
                     
                    LEFT JOIN
                    (SELECT  LotNum,BoardNo,VrsCode,Max(Cast(Scrapped As real))Scrapped,Max(Cast(Repair As real))Repair FROM YM_VRS_Test_Result a(nolock)
                        WHERE LotNum IN (${lotStr}) AND (Scrapped='1' or Repair='1') GROUP BY LotNum,BoardNo,VrsCode
                    )
                    U
                    ON T.AcmeLot=U.LotNum AND T.BoardNo=U.BoardNo AND T.VrsCode=U.VrsCode`;


                            


                    promiseAry.push(poolDc.query(sqlOst));

                })
            });

            return Promise.all(promiseAry);

            // } else {

            //     const weekAry = [...new Set(result[0].map((i) => i.Week))].sort((a, b) => b - a);

            //     const runweekAry = weekAry.splice(0, weekEnd);

            //     runweekAry.forEach((w) => {
            //         conditionAry.forEach((i) => {

            //             let twoGigFilter = '';
            //             let ostIndexTable = '';
            //             let Type = '';
            //             let lotStr = '';

            //             if (i === 'MP_2Gig') {
            //                 twoGigFilter = `AND ProcCode='TST09'`;
            //                 ostIndexTable = 'YM_OST_EMIB_Index_Table';
            //                 Type = 'MP';
            //                 lotStr = `'${result[0].filter((i) =>
            //                     i.type === 'MP'
            //                     &&
            //                     i.Week === w
            //                     &&
            //                     mptwoGigPart.includes(i.partno)
            //                 ).map((i) => i.lotno).join("','")}'`;
            //             } else if (i === 'BD') {
            //                 twoGigFilter = `AND ProcCode='TST25'`;
            //                 ostIndexTable = 'YM_OST_EMIB_Index_Table';
            //                 Type = 'BD';
            //                 lotStr = `'${result[0].filter((i) =>
            //                     i.type === 'Brigde_die'//要改成BD
            //                     &&
            //                     i.Week === w
            //                     // &&
            //                     // mptwoGigPart.includes(i.partno)
            //                 ).map((i) => i.lotno).join("','")}'`;
            //             } else {
            //                 twoGigFilter = '';
            //                 ostIndexTable = 'YM_OST_Index_Table';
            //                 Type = 'MP';
            //                 lotStr = `'${result[0].filter((i) =>
            //                     i.type === 'MP'
            //                     &&
            //                     i.Week === w
            //                     &&
            //                     !mptwoGigPart.includes(i.partno)
            //                 ).map((i) => i.lotno).join("','")}'`;
            //             };

            //             let sqlOst = `SELECT Week='${w}',Type='${Type}',T.PartNo,T.AcmeLot,CAST(T.BoardNo AS REAL)BoardNo,Panel_X,Panel_Y,T.VrsCode,
            //         CASE  WHEN NgBin IS NULL THEN '0001' ELSE NgBin END NgBin,T.NCN,U.Scrapped,U.Repair FROM (SELECT LEFT(u.CenterPart,7)PartNo,r.AcmeLot,Substring(r.[2D_ID],12,2)BoardNo,u.Panel_X,u.Panel_Y,u.VrsCode,r.NgBin,n.Classify+'-'+Ltrim(Str(n.SubClassifyID))NCN FROM 
            //         ${ostIndexTable}(nolock)r
            //         LEFT JOIN YM_ULT_UnitBase(nolock)u ON r.[2D_ID]=u.[MPID] AND r.X=u.MP_X and r.Y=u.MP_Y
            //         LEFT JOIN YM_NCN_Kill_Unit(nolock)n ON r.AcmeLot= n.LotNum AND Str(Cast(Substring(r.[2D_ID],12,2)As real))=Str(n.BoardNo) AND u.VrsCode=n.VrsCode
            //         WHERE r.AcmeLot IN (${lotStr}) AND (u.ScrappedSource<>'FLIVRS' OR u.ScrappedSource IS NULL)${twoGigFilter})
            //         T 
            //         LEFT JOIN
            //         (SELECT  LotNum,BoardNo,VrsCode,Max(Cast(Scrapped As real))Scrapped,Max(Cast(Repair As real))Repair FROM YM_VRS_Test_Result a(nolock)
            //             WHERE LotNum IN (${lotStr}) AND (Scrapped='1' or Repair='1') GROUP BY LotNum,BoardNo,VrsCode
            //         )
            //         U
            //         ON T.AcmeLot=U.LotNum AND T.BoardNo=U.BoardNo AND T.VrsCode=U.VrsCode
            //         `;
            //             promiseAry.push(poolDc.query(sqlOst))
            //         });
            //     });

            //     return Promise.all(promiseAry);

            // }
        })
        .then((resultAry) => {

            const ngbinAry = [
                { number: '0007', column: 'Bin07' },
                { number: '0008', column: 'Bin08' },
                { number: '0010', column: 'Bin10' },
                { number: '0021', column: 'Bin21' },
                { number: '0022', column: 'Bin22' },
                { number: '0023', column: 'Bin23' },
                { number: '0031', column: 'Bin31' },
                { number: '0032', column: 'Bin32' },
                { number: '0033', column: 'Bin33' },
                { number: '0091', column: 'Bin91' },
                { number: '0092', column: 'Bin92' },
                { number: '0099', column: 'Bin99' }
            ];

            const bin99_skip_rule = ['A1-50', 'A1-52'];
            let ostData = [];
            const summaryData = [];

            resultAry.forEach((i) => {///篩選計算良率/不良率的data
                const data = i.recordset.filter((i) => /// BD的NgBin!=='0099'
                    (
                        i.Type === 'MP'
                        &&
                        (
                            i.NgBin !== '0099'
                            ||
                            i.NgBin === '0099' && (bin99_skip_rule.includes(i.NCN) || i.NCN === null)
                        )
                    )
                    ||
                    (
                        i.Type === 'BD'
                        &&
                        i.NgBin !== '0099'
                    )
                );

                ostData = [...ostData, ...data];
            });

            const weekAry = [...new Set(ostData.map((i) => i.Week))];

            weekAry.forEach((w) => {

                const weekData = ostData.filter((i) => i.Week === w);

                const typeAry = [...new Set(weekData.map((i) => i.Type))];

                typeAry.forEach((t) => {

                    const typeData = weekData.filter((i) => i.Type === t);

                    const partAry = [...new Set(typeData.map((i) => i.PartNo))];

                    partAry.forEach((p) => {

                        const partData = typeData.filter((i) => i.PartNo === p);

                        const xyAry = [...new Set(partData.map((i) => i.Panel_X + '_' + i.Panel_Y))];

                        xyAry.forEach((i) => {

                            const Obj = {};
                            const xyParams = i.split('_');

                            Obj.Type = t;
                            Obj.partno = p;
                            Obj.Week = w;
                            Obj.UnitX = xyParams[0];
                            Obj.UnitY = xyParams[1];

                            const filterData = partData.filter((d) => `${d.Panel_X}_${d.Panel_Y}` === i);

                            const totalCount = filterData.length;
                            const totalbinCount = filterData.filter((i) => i.NgBin !== '0001').length;

                            const aoi0031Count = filterData.filter((i) => i.NgBin === '0031' && i.Scrapped === 1).length;///0031_aoi

                            const aos0031Count = filterData.filter((i) => i.NgBin === '0031' && i.Scrapped === 0 && i.Repair === 1).length;///0031_aoi

                            const clear0031Count = filterData.filter((i) => i.NgBin === '0031' && i.Scrapped === null && i.Repair === null).length;///0031_aoi

                            ngbinAry.forEach((n) => {///個別缺點

                                if (n.number === '0031') {////分出0031_aoi 0031_aos 0031_clear

                                    Obj[`${n.column}_aoi_rate`] = (aoi0031Count / totalCount).toFixed(4);
                                    Obj[`${n.column}_aos_rate`] = (aos0031Count / totalCount).toFixed(4);
                                    Obj[`${n.column}_clear_rate`] = (clear0031Count / totalCount).toFixed(4);

                                } else {

                                    const ngCount = filterData.filter((i) => i.NgBin === n.number).length;
                                    Obj[`${n.column}_rate`] = (ngCount / totalCount).toFixed(4);

                                }
                            });

                            Obj[`All_rate`] = (totalbinCount / totalCount).toFixed(4);



                            summaryData.push(Obj);

                        })
                    })
                })
            });

            res.json(
                {
                    stackdata: {
                        data: summaryData,
                        db: 'paoi',
                        table: 'ost_stack',
                        match: [ 'All_rate', 'Bin07_rate', 'Bin08_rate', 'Bin10_rate', 'Bin21_rate', 'Bin22_rate', 'Bin23_rate', 'Bin31_clear_rate', 'Bin31_aoi_rate', 'Bin31_aos_rate', 'Bin32_rate', 'Bin33_rate', 'Bin91_rate', 'Bin92_rate', 'Bin99_rate']
                    }
                }
            );

        })
        .catch((err) => {
            console.log(err);
        })
})

module.exports = router
