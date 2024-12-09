const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');
const fs = require('fs');
const { poolAcme, poolDc, poolNCN } = require('../mssql');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS } = require('../time.js')

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

router.get('/ostlinkaoi/:lot/:layer', (req, res) => {
    const { lot, layer } = req.params;
    const sqlAoi = `SELECT * FROM ptaoi_yield_defect a 
    LEFT JOIN aoi_target_trigger b
    ON a.PartNo=b.PartNum 
    AND a.Layer=b.LayerName 
    WHERE LotNum ='${lot}' AND Layer='${layer}' 
    `;

    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            return queryFunc(connection, sqlAoi)
        })
        .then((results) => {
            res.json(results)
        })
        .catch((err) => {
            console.log(err)
        })
})

router.get('/rawdata/:type/:lot/:part', (req, res) => {

    const { type, lot, part } = req.params;

    let ostTable = '';
    let twoGigFilter = '';

    const sqltwoGig = `SELECT DISTINCT PartNum FROM YM_OST_SUB_Receipe WHERE PartNum='${part}'`;

    poolDc.query(sqltwoGig)
        .then((result) => {

            const twoGigAry = result.recordset;

            if (twoGigAry.length > 0 && type === 'MP') { ///MP one Gig
                ostTable = 'YM_OST_EMIB_Index_Table';
                twoGigFilter = `AND ProcCode='TST09'`;
            } else if (twoGigAry.length === 0 && type === 'MP') {
                ostTable = 'YM_OST_Index_Table';
            } else { ////BD
                ostTable = 'YM_OST_EMIB_Index_Table';
                twoGigFilter = `AND ProcCode='TST25'`;
            }

            const sqlOst = `SELECT T.AcmeLot,CAST(T.BoardNo AS REAL)BoardNo,Panel_X,Panel_Y,T.VrsCode,
    CASE 
    WHEN NgBin IS NULL THEN '0001'
    WHEN NgBin='0007' THEN 'Soft Spec 4wR Low'
    WHEN NgBin='0008' THEN 'Soft Spec 4wR High'
    WHEN (NgBin='0010' OR NgBin='1201') THEN '2w Open'
    WHEN NgBin='0021' THEN '4wR Low'
    WHEN NgBin='0022' THEN '4wR High'
    WHEN NgBin='0023' THEN '4wR >1000ohm'
    WHEN (NgBin='0031' OR NgBin='3101') AND Repair='1' THEN 'Micro Short(AOS)' 
    WHEN (NgBin='0031' OR NgBin='3101') AND Scrapped='1' THEN 'Micro Short(AOI)'
    WHEN (NgBin='0031' OR NgBin='3101') AND Scrapped is null THEN 'Micro Short(Non_AOI)'
    WHEN (NgBin='0032' OR NgBin='3201') THEN 'Spark'
    WHEN (NgBin='0033' OR NgBin='3301') THEN 'Leak'
    WHEN NgBin='0091' THEN 'Contact Fail'
    WHEN NgBin='0092' THEN 'Alignment'
    WHEN NgBin='0099' THEN 'No Test'
    ELSE NgBin END NgBin,T.NCN,U.Scrapped,U.Repair FROM (SELECT r.AcmeLot,Substring(r.[2D_ID],12,2)BoardNo,u.Panel_X,u.Panel_Y,u.VrsCode,r.NgBin,n.Classify+'-'+Ltrim(Str(n.SubClassifyID))NCN FROM 
    ${ostTable}(nolock)r
    LEFT JOIN YM_ULT_UnitBase(nolock)u ON r.[2D_ID]=u.[MPID] AND r.X=u.MP_X and r.Y=u.MP_Y
    LEFT JOIN YM_NCN_Kill_Unit(nolock)n ON r.AcmeLot= n.LotNum AND Str(Cast(Substring(r.[2D_ID],12,2)As real))=Str(n.BoardNo) AND u.VrsCode=n.VrsCode
    WHERE r.AcmeLot ='${lot}' AND (u.ScrappedSource<>'FLIVRS' OR u.ScrappedSource IS NULL)${twoGigFilter})
    T 
    LEFT JOIN
    (SELECT  LotNum,BoardNo,VrsCode,Max(Cast(Scrapped As real))Scrapped,Max(Cast(Repair As real))Repair FROM YM_VRS_Test_Result a(nolock)
        WHERE LotNum ='${lot}' AND (Scrapped='1' or Repair='1') GROUP BY LotNum,BoardNo,VrsCode
    )
    U
    ON T.AcmeLot=U.LotNum AND T.BoardNo=U.BoardNo AND T.VrsCode=U.VrsCode`;

            const sqlAoi = `SELECT LotNum,f.Section,FB,LayerName,Side,BoardNo,VrsCode,Classify,GroupID,Scrapped,Repair FROM 
    (SELECT LotNum,
    CASE WHEN ((EndLayer-Fromlayer)+1/2)>1 OR FromLayer='0' THEN 'BU' else 'CORE' END Section,
    CASE WHEN FromLayer='0' then '-Outer' else Cast((((EndLayer- FromLayer)+1)/2)as varchar)+'FB' END FB,
    RTRIM(LayerName)LayerName,Side,BoardNo,VrsCode,Classify,Scrapped,Cast(Repair AS REAL)Repair  
    FROM YM_VRS_Test_Result(nolock)a
    LEFT JOIN acme.dbo.numoflayer(nolock)n 
    ON a.Layer=n.Layer)f
    LEFT JOIN YM_AOI_DefectCode(nolock)d 
    ON f.Section=d.Section and f.Classify=d.Defectcode
    WHERE LotNum='${lot}' AND Classify<>'0'
    `;

            return Promise.all(
                [
                    poolDc.query(sqlOst),
                    poolDc.query(sqlAoi)
                ]
            )

        })
        .then((result) => {
            const bin99_skip_rule = ['A1-50', 'A1-52'];
            const ostData = result[0].recordset.filter((i) =>
                // (
                //     type === 'MP'
                //     &&
                    (
                        i.NgBin !== '0099'
                        ||
                        i.NgBin === '0099' && (bin99_skip_rule.includes(i.NCN) || i.NCN === null)
                    )
                // )
                // ||
                // (
                //     type === 'BD'
                //     &&
                //     i.NgBin !== '0099'
                // )
            );
            const aoiData = result[1].recordset;
            ostData.forEach((i) => {
                const filterData = aoiData.filter((a) => a.BoardNo === i.BoardNo && a.VrsCode === i.VrsCode);
                i.info = filterData;
            });
            res.json(ostData);
        })
        .catch((err) => {
            console.log(err);
        });
});


module.exports = router
