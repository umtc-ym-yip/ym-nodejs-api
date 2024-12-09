const express = require('express');
const mysql = require('mysql2');
const sql = require('mssql');
const fs = require('fs');
const sftpPool = require('../ssh');
const { poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc } = require('../mssql');

const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js')
const { timestampToYMDHIS, timestampToYMDHIS2, timestampToYMDHIS3 } = require('../time.js')

const router = express.Router();

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

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

const configAcme = {
    server: '10.22.65.120',
    user: 'dc',
    password: 'dc',
    database: 'acme',
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

const configNCN = {
    server: '10.22.65.134',
    user: 'ymyip',
    password: '5CQPBcyE',
    database: 'NCN',
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

router.get('/trendpn', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sql = "SELECT DISTINCT PartNo FROM `aoi_trend` WHERE LEFT(PartNo,4)<>'UMGL'";
            return queryFunc(connection, sql)
        })
        .then((results) => {
            res.json(results)
        })
        .catch((err) => {
            console.log(err)
        })
});

router.get('/trenddata', (req, res) => {

    mysqlConnection(configFunc('paoi'))
        .then((connection) => {

            let promiseAry = [];
            let defectAry = [];

            const { start, end, part, process, defect, status, layer, lottype } = req.query
            ///defect S1+S2 or S1;S2 or S1
            console.log(req.query);
            let defectStr = '';
            let processStr = '';
            if (status === 'combine') {

                defectStr = defect.split(',').join('+');
                console.log(defectStr)
            }
            else {
                defectAry = defect.split(',');
            }

            let transStart = timestampToYMDHIS(Number(start));
            let transEnd = timestampToYMDHIS(Number(end));
            let typeStr = "'" + lottype.split(',').join("','") + "'"

            // Core 7碼 要多次或status==='apart'

            let sql = '';

            if (layer === 'BU') {

                if (status === 'combine') {
                    sql = `SELECT PartNo,LotType,LotNum,LayerName,Bef_Yield,ChangeTime,CASE WHEN ${defectStr} ='.' THEN '0' ELSE ${defectStr} END Rate,'${defectStr}' as Defect,Time${process}1 as CheckIn,Machine${process}1 as Machine FROM aoi_trend 
                    WHERE LotType IN (${typeStr}) AND PartNo IN (${part}) AND Time${process}1 BETWEEN '${transStart}' AND '${transEnd}' AND
                    (SUBSTRING_INDEX(LayerName,'L',-1)='-Outer' 
                        OR 
                    ((Cast(SUBSTRING_INDEX(LayerName,'L',-1) as real)-Cast(SUBSTRING_INDEX(SUBSTRING_INDEX(LayerName,'L',-2),'L',1) as real))+1)/2<>1)`;

                    return queryFunc(connection, sql);

                } else {////apart
                    defectAry.forEach((d) => {

                        sql = `SELECT PartNo,LotType,LotNum,LayerName,Bef_Yield,ChangeTime,CASE WHEN ${d}='.' THEN '0' else ${d} END Rate,'${d}' as Defect,Time${process}1 as CheckIn,Machine${process}1 as Machine FROM aoi_trend 
                    WHERE LotType IN (${typeStr}) AND PartNo IN (${part}) AND Time${process}1 BETWEEN '${transStart}' AND '${transEnd}' AND
                    (SUBSTRING_INDEX(LayerName,'L',-1)='-Outer' 
                        OR 
                    ((Cast(SUBSTRING_INDEX(LayerName,'L',-1) as real)-Cast(SUBSTRING_INDEX(SUBSTRING_INDEX(LayerName,'L',-2),'L',1) as real))+1)/2<>1)`;

                        promiseAry.push(queryFunc(connection, sql))
                    });

                    return Promise.all(promiseAry)
                }

            } else {////Core

                if (process.length === 7) {
                    processStr = process;
                } else {
                    processStr = process + '1'
                }

                if (status === 'combine') {

                    sql = `SELECT PartNo,LotType,LotNum,LayerName,Bef_Yield,ChangeTime,CASE WHEN ${defectStr} ='.' THEN '0' ELSE ${defectStr} END Rate,'${defectStr}' as Defect,Time${processStr} as CheckIn,Machine${processStr} as Machine FROM aoi_trend 
                WHERE LotType IN (${typeStr}) AND PartNo IN (${part}) AND Time${processStr} BETWEEN '${transStart}' AND '${transEnd}' AND

                ((Cast(SUBSTRING_INDEX(LayerName,'L',-1) as real)-Cast(SUBSTRING_INDEX(SUBSTRING_INDEX(LayerName,'L',-2),'L',1) as real))+1)/2=1`;

                    return queryFunc(connection, sql);

                } else {////apart
                    defectAry.forEach((d) => {
                        sql = `SELECT PartNo,LotType,LotNum,LayerName,Bef_Yield,ChangeTime,CASE WHEN ${d}='.' THEN '0' else ${d} END Rate,'${d}' as Defect,Time${processStr} as CheckIn,Machinee${processStr} as Machine FROM aoi_trend 
                WHERE LotType IN (${typeStr}) AND PartNo IN (${part}) AND Time${processStr} BETWEEN '${transStart}' AND '${transEnd}' AND
 
                ((Cast(SUBSTRING_INDEX(LayerName,'L',-1) as real)-Cast(SUBSTRING_INDEX(SUBSTRING_INDEX(LayerName,'L',-2),'L',1) as real))+1)/2=1`;

                        promiseAry.push(queryFunc(connection, sql))

                    });

                    return Promise.all(promiseAry)
                }

            }
            // console.log(sql);
            // return queryFunc(connection, sql)

        })
        .then((results) => {
            res.json(results)
        })
        .catch((err) => {
            console.log(err)
        })
});

router.get('/mapping/:lot/:layer/:isincludefake/:process/:factory', (req, res) => {

    const { lot, layer, isincludefake, process, factory } = req.params;

    let scrappedFilter = `${Number(isincludefake) ? ' ' : " and Classify <>'0'"}`;

    let table = process === 'ptaoi' ? 'V_LayoutDetail_Jmp' : 'V_FLI_LayotDetail_Jmp';
    // SN_VRS_test_result_new
    let connectPool
    if (factory === 'SN') {
        connectPool = poolSNDc
    } else {
        connectPool = poolDc
    }

    connectPool.query(`SELECT * from ${table}(nolock) where LotNum ='${lot}' and LayerName='${layer}'${scrappedFilter}`)
        .then((result) => {
            res.json(result.recordset);
        })
        .catch((err) => {
            console.log(err);
        })

});



router.get('/layout/:part/:lot/:layer', (req, res) => {
    const { part, lot, layer } = req.params;

    // const pool = new sql.ConnectionPool(configDc);

    poolDc.query(`SELECT DISTINCT TOP 1 a.partnum
            From acme.dbo.pdl_ckhistory a(nolock), acme.dbo.numoflayer b, acme.dbo.prodbasic c where a.layer = b.Layer  And a.partnum = c.PartNum
            And a.revision = c.Revision And a.lotnum in ('${lot}')
            And b.LayerName = '${layer}'`)
        .then((result) => {
            const { partnum } = result.recordset[0];
            return poolDc.query(`SELECT DISTINCT TOP 1 Filmpart FROM YM_FilmPart_Map(nolock)
            where Acmepart = '${partnum}'`)
        })
        .then((result) => {
            const { Filmpart } = result.recordset[0];
            const sqlBody = `SELECT DISTINCT CompXUpper,CompXLower,CompYUpper,CompYLower From YM_Layout_Center_Body a(nolock) where JobName ='${Filmpart}'`;
            const sqlHead = `SELECT MpLtX*MpLtY*4 UPP from YM_Layout_Center_Head(nolock) WHERE JobName ='${Filmpart}'`;
            return Promise.all([poolDc.query(sqlBody), poolDc.query(sqlHead)])
        })
        .then((result) => {

            const data = result[0].recordset;
            const headdata = result[1].recordset;

            const mixinX = [...new Set([...data.map((i) => i.CompXUpper), ...data.map((i) => i.CompXLower)])].sort((a, b) => a - b);
            const mixinY = [...new Set([...data.map((i) => i.CompYUpper), ...data.map((i) => i.CompYLower)])].sort((a, b) => a - b);

            let dataAry = [];

            mixinX.forEach((x) => {

                const downAry = [];
                const topAry = [];

                const objdownbPoint = {};
                const objdownePoint = {};
                const objtopbPoint = {};
                const objtopePoint = {};

                objdownbPoint.x = x;
                objdownbPoint.y = mixinY[0];
                objdownePoint.x = x;
                objdownePoint.y = mixinY[mixinY.length / 2 - 1];

                objtopbPoint.x = x;
                objtopbPoint.y = mixinY[mixinY.length / 2];
                objtopePoint.x = x;
                objtopePoint.y = mixinY[mixinY.length - 1];

                downAry.push(objdownbPoint);
                downAry.push(objdownePoint);

                topAry.push(objtopbPoint);
                topAry.push(objtopePoint);

                dataAry.push(downAry);
                dataAry.push(topAry);

            });

            mixinY.forEach((y) => {

                const leftAry = [];
                const rightAry = [];

                const objleftbPoint = {};
                const objleftePoint = {};
                const objrightbPoint = {};
                const objrightePoint = {};

                objleftbPoint.x = mixinX[0];
                objleftbPoint.y = y;
                objleftePoint.x = mixinX[mixinX.length / 2 - 1];
                objleftePoint.y = y;

                objrightbPoint.x = mixinX[mixinX.length / 2];
                objrightbPoint.y = y;
                objrightePoint.x = mixinX[mixinX.length - 1];
                objrightePoint.y = y;

                leftAry.push(objleftbPoint);
                leftAry.push(objleftePoint);

                rightAry.push(objrightbPoint);
                rightAry.push(objrightePoint);

                dataAry.push(leftAry);
                dataAry.push(rightAry);

            });

            res.json({ dataAry, headdata });
        })
        // .finally(() => {
        //     pool.close();
        // })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/getlot/:oldlot/:layer', (req, res) => {
    const { oldlot, layer } = req.params;

    const sql = `SELECT * FROM ptaoi_yield_defect d LEFT JOIN aoi_target_trigger t
    ON d.PartNo=t.PartNum AND d.Layer=t.LayerName
    WHERE OldLotNum ='${oldlot}' AND Layer='${layer}' `;

    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            return queryFunc(connection, sql)
        })
        .then((result) => {
            res.json(result)
        })
        .catch((err) => {
            console.log(err)
        });
})

router.get('/image', async (req, res) => {
    try {
        const { url, factory } = req.query;
        
        if (!url) {
            return res.status(400).send('URL parameter is required');
        }

        // YM廠或非SFTP路徑的情況
        if (factory === 'YM' || !url.includes('10.23.204.68')) {
            const imageBuffer = fs.readFileSync(`${url}`);
            return res.send(imageBuffer.toString('base64'));
        }

        // SN廠或SFTP路徑的情況
        if (factory === 'SN' || url.includes('10.23.204.68')) {
            try {
                const client = await sftpPool.acquire();
                try {
                    const formattedPath = url
                        .replace(/^\\\\[\d\.]+/, '')
                        .replace(/\\/g, '/')
                        .replace(/^\/+/, '/');

                    const buffer = await client.get(formattedPath, undefined, true);
                    res.send(buffer.toString('base64'));
                } catch (err) {
                    console.error('SFTP get error:', err);
                    res.status(404).send('');
                } finally {
                    await sftpPool.release(client);
                }
            } catch (err) {
                console.error('SFTP pool acquisition error:', err);
                res.status(500).send('');
            }
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).send('');
    }
});

// router.get('/imagesn', (req, res) => {
//     const conn = new Client();
//     const sftpPath = '//10.23.204.68/VRSimg/';
//     // const sftpPath = '//10.23.204.68/VRSimg/6111j01b01/la-sn/BARE_COPPER_cdr/243OF001-01-00-S/2-3.jpg';
//     conn.on('ready', () => {
//         console.log('here')
//         conn.sftp((err, sftp) => {
//             console.log('err???', err);
//             console.log('sftp???', sftp);
//             if (err) throw err;

//             sftp.readdir(sftpPath, (err, data) => {
//                 if (err) {
//                     console.log('err', err);
//                 } else {
//                     console.log('file data:', data);
//                 }
//             });
//             conn.end();
//         })
//     }).connect({
//         host: '10.23.60.3',
//         port: 22,
//         username: 'Lthmanager_user',
//         password: '1qazXSW@user',
//         readyTimeout: 30000
//     })
// })


router.get('/history/:lot/:layer/:factory', (req, res) => {
    const { lot, layer, factory } = req.params;

    const layerAry = layer.substring(1, layer.length).split('L');

    let sqlStr = '';

    let poolConnect
    if (factory === 'SN') {
        poolConnect = poolSNAcme;
    } else {
        poolConnect = poolAcme
    }
    sqlStr = `select Lot, LayerName Layer, Layer Layer_temp, Status, ProcName, ProcName2, concat(ProcName, '_', Rank) ProcName3, MachineName Machine, ChangeTime
from(
    select Lot, LayerName, Layer, Status, ProcName, ProcName2, MachineName, ChangeTime, Rank() over (partition by lot, Layer, Status, ProcName order by ChangeTime asc) Rank
    from(
        select Lot, LayerName, 
        CASE WHEN ProcName in ('ABFCLN','ABFCPO','ABFIPW','ABFMEC','ABFMPO','ABFABF','ABFPOS','ABFBZO','ABFCZO') 
        THEN CASE WHEN LayerName = '-Outer'
            THEN '-Outer'
            ELSE CASE WHEN substring(LayerName,CHARINDEX('L',LayerName)+1,CHARINDEX('L',LayerName,4)-CHARINDEX('L',LayerName)-1) = '2'
                THEN '-Outer'
                ELSE concat('-L',Rtrim(CAST(CAST(substring(LayerName,CHARINDEX('L',LayerName)+1,CHARINDEX('L',LayerName,4)-CHARINDEX('L',LayerName)-1) as int)-1 as char)),'L',CAST(CAST(substring(LayerName,CHARINDEX('L',LayerName,4)+1,2) as int)+1 as char)) END
            END
        ELSE LayerName END AS Layer,
        Status, ProcName, ProcName2, MachineName, ChangeTime
        from (
            select  Rtrim(lotnum) Lot, Rtrim(c.LayerName)LayerName, a.AftStatus Status, p.ProcName, left(p.ProcName,3) + CAST(a.BefDegree as char(1)) + right(p.ProcName,3) + CAST(a.AftTimes as char(1)) as ProcName2, e.MachineName, convert(varchar, ChangeTime, 120) ChangeTime, Rank() over (partition by Rtrim(lotnum), Rtrim(c.LayerName), AftStatus, p.ProcName order by ChangeTime asc) Rank 
            from pdl_ckhistory a(nolock) 
            inner join numoflayer c(nolock) on a.layer = c.Layer
            inner join ProcBasic(nolock) p on a.proccode = p.ProcCode
            inner join acme.dbo.PDL_Machine e(nolock) on a.machine=e.machineid
            where a.AftStatus='CheckIn'
            ) dt
        ) dt2
    ) dt3
where Rtrim(Lot) = '${lot}' and Layer = '${layer}'
order by ChangeTime asc`
    // if (((layerAry[1] - layerAry[0]) + 1) / 2 === 1) { ///Core
    //     sqlStr = `With dt as(Select * from (Select  h.ChangeTime,n.LayerName,c.ProcName,c.ProcCode,m.MachineName,ROW_NUMBER() OVER(PARTITION BY ProcName,LayerName Order BY [ChangeTime] desc)Rank from PDL_CKHistory(nolock)h,PDL_Machine(nolock)m,ProcBasic(nolock)c,NumofLayer(nolock)n where
    //     h.Machine=m.MachineId and h.proccode=c.ProcCode and h.layer= n.Layer and h.BefStatus='MoveIn' and h.AftStatus='CheckIn' and h.lotnum ='${lot}' ) T where T.Rank ='1')
    //   Select ChangeTime,SUBSTRING(LayerName,2,LEN(LayerName))Layer,ProcName,MachineName Machine  from (Select * from dt where ProcName in ('ABFCLN','ABFCPO','AOICAP','AOICVR','AOIVRR','LTHCDI','LTHDES','LTHPTR','LTHRAD','MDLIPQ','MDLMDL','MDLMDR','MDLPIN','PLGANL','PLGBAK','PLGPOS','PLGPRC','PLGPTR','PLGSTN','PLGTAP','PLGVCP','PLSDBR','PLSPTR','PLSRBG','PLSRTP','PTHDEM','PTHELS','PTHIPQ','PTHPCU','PTHPTR','PTHRTP','RLSPOS','RLSRLS') and LayerName ='${layer}'  Union Select * from dt where ProcName in ('ABFABF'))T order by ChangeTime desc`
    // } else {
    //     sqlStr = `With dt as(Select * from (Select  h.ChangeTime,n.LayerName,c.ProcName,c.ProcCode,m.MachineName,ROW_NUMBER() OVER(PARTITION BY ProcName,LayerName Order BY [ChangeTime] desc)Rank from PDL_CKHistory(nolock)h,PDL_Machine(nolock)m,ProcBasic(nolock)c,NumofLayer(nolock)n where
    //     h.Machine=m.MachineId and h.proccode=c.ProcCode and h.layer= n.Layer and h.BefStatus='MoveIn' and h.AftStatus='CheckIn' and h.lotnum ='${lot}' ) T where T.Rank ='1')
    //   Select ChangeTime,SUBSTRING(LayerName,2,LEN(LayerName))Layer,ProcName,MachineName Machine  from (Select * from dt where ProcName in ('AOIVRS','AOIAEI','AOICVR','AOICAP','PTHSAC','PTHCUM','PTHFCU','LTHDFV','LTHSEP','LTHADF','SAPPEC','SAPNOV','SAPECU','SAPDEM','LDLPRC','LDLABL','LDLCOL','ABFPRC') and LayerName ='${layer}'  Union Select * from dt where ProcName in ('ABFABF'))T order by ChangeTime desc`
    // };

    poolConnect.query(sqlStr)
        .then((result) => {
            res.json(result.recordset);
        })
        .catch((err) => {
            console.log(err);
        })
});



router.get('/flihistory/:lot', (req, res) => {
    const { lot } = req.params;

    const processList = ['ABFCLN', 'AOIAEI', 'AOIVRS', 'EPGCTF', 'EPGENP', 'EPGPMA', 'EPGPRE', 'FLIACP', 'FLIANL', 'FLIAOI', 'FLICLV', 'FLICUP', 'FLIDEM', 'FLIDFV', 'FLIIPQ', 'FLIIPW', 'FLIIPX', 'FLINIP', 'FLIOLE', 'FLIOTP', 'FLISAC', 'FLISEP', 'FLISNA', 'FLIVRS', 'SMKANL', 'SMKDUV', 'SMKIPQ', 'SMKIPW', 'SMKMEC', 'SMKOTP', 'SMKPOS', 'SMKSEP', 'SMKVDF', 'UVLIPW', 'UVLPMA', 'UVLUVL'];
    const processStr = `'${processList.join("','")}'`;

    const sqlStr = `SELECT DISTINCT
    CASE WHEN d.ProdClass IS NULL THEN ''
    WHEN d.ProdClass ='APD' THEN 'OSAT' 
    ELSE d.ProdClass END ProdClass,
    RTRIM(h.partnum)PartNo,
    RTRIM(h.revision)Rev,
    RTRIM(h.lotnum)LotNum,
    RTRIM(f.LayerName)LayerName,
    d.NumOfLayer,
    t.ITypeName LotType,
    h.Qnty_S Qnty,
    h.proccode ProcCode,
    b.ProcName,
    LEFT(b.ProcName,3)+CAST(h.BefDegree AS CHAR(1))+RIGHT(b.ProcName,3)+CAST(h.BefTimes AS CHAR(1))ProcNameE,
    m.MachineName,
    h.BefStatus,
    h.AftStatus,
    CONVERT(VARCHAR, h.ChangeTime, 120)ChangeTime
    FROM PDL_CKhistory h(nolock)
    INNER JOIN procbasic b(nolock) ON h.proccode = b.ProcCode 
    INNER JOIN numoflayer f(nolock) ON h.layer = f.Layer
    INNER JOIN ClassIssType t(nolock) ON h.isstype=t.ITypeCode
    INNER JOIN prodbasic d(nolock) ON h.partnum=d.PartNum AND h.revision=d.Revision AND h.layer=d.Layer
    INNER JOIN PDL_Machine(nolock)m ON h.Machine=m.MachineId
    WHERE
    h.AftStatus='CheckIn' AND
    h.lotnum='${lot}' AND
    f.LayerName='-Outer' AND
    b.ProcName IN (${processStr})
    ORDER BY ChangeTime DESC`;

    poolAcme.query(sqlStr)
        .then((result) => {
            res.json(result.recordset);
        })
        .catch((err) => {
            console.log(err);
        })

});


router.get('/ncnrecord/:lot', (req, res) => {

    const { lot } = req.params;

    // const pool = new sql.ConnectionPool(configNCN);

    poolNCN.query(`SELECT 
    ncn_no,
    open_datetime,
    SUBSTRING(Layer,CHARINDEX('/',Layer)+2,LEN(Layer))Layer,
    Case when SUBSTRING(Failure_mode,0,CHARINDEX('/',Failure_mode))='' then Failure_mode else SUBSTRING(Failure_mode,0,CHARINDEX('/',Failure_mode)) end Failure_mode,
    Problem_des,
    Prd_qty,
    Defect_qty,
    Prd_unit,
    Defect_unit,
    ncn_level from MRB_Detail(nolock)
    WHERE lot_no = '${lot}' OR ncn_no IN (SELECT ncn_no FROM MRB_WIP(nolock) WHERE WIP_LN ='${lot}' OR WIP_PN ='${lot}' )
    AND mrb_status='Y' order by layer desc

`)


        .then((result) => {
            res.json(result.recordset);
        })
        // .finally(() => {
        //     pool.close();
        // })
        .catch((err) => {
            console.log(err);
        });
});

router.get('/device', (req, res) => {

    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sql = "SELECT DISTINCT ProdClass,PartNo FROM `ptaoi_yield_defect` WHERE LEFT(PartNo,4)<>'UMGL'";
            return queryFunc(connection, sql)
        })
        .then((results) => {
            res.json(results)
        })
        .catch((err) => {
            console.log(err)
        })
});

router.get('/aoitrenddata', (req, res) => {

    const { st, et, part, procg, procc, cfy, sts, layer, ltp } = req.query;

    let buorcore = '';
    if (layer === 'BU') {
        buorcore = '>1'
    } else {
        buorcore = '=1'
    };

    ///cfy ['S1','S2']
    let classifyColumn = '';
    let classifyFilter = '';

    if (sts === 'combine') {
        classifyColumn = `'${cfy.split(',').join('+')}'`;
        classifyFilter = `'${cfy.split(',').join("','")}'`;
    } else {
        classifyFilter = `'${cfy.split(',').join("','")}'`;
    }

    mysqlConnection(configFunc('paoi'))
        .then((connection) => {

            let sqlStr = '';
            if (sts === 'combine') {

                sqlStr = `SELECT r.ProdClass,m.PartNo,m.LotNum,m.LayerName,m.LotType,${classifyColumn} AS Classify,Sum(r.Rate)Rate,m.ProcGroup,m.ProcNameE,m.MachineName,m.ChangeTime FROM aoi_trend_machine m
                INNER JOIN aoi_trend_rate r 
                ON m.PartNo=r.PartNo 
                AND m.LotNum = r.LotNum 
                AND m.MatchLayer = r.MatchLayer
                WHERE m.PartNo IN (${part}) 
                AND m.MatchLayer ${buorcore}
                AND m.ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
                AND m.ProcGroup='${procg}' 
                AND m.ProcNameE='${procc}'
                AND r.Classify IN (${classifyFilter})
                AND m.LotType IN (${ltp})
                GROUP BY r.ProdClass,m.PartNo,m.LotNum,m.LayerName,m.ProcGroup,m.ProcNameE,m.MachineName,m.ChangeTime
                `;
            } else {
                sqlStr = `SELECT r.ProdClass,m.PartNo,m.LotNum,m.LayerName,m.LotType,r.Classify,r.Rate,m.ProcGroup,m.ProcNameE,m.MachineName,m.ChangeTime FROM aoi_trend_machine m
                INNER JOIN aoi_trend_rate r 
                ON m.PartNo=r.PartNo 
                AND m.LotNum = r.LotNum 
                AND m.MatchLayer = r.MatchLayer
                WHERE m.PartNo IN (${part}) 
                AND m.MatchLayer ${buorcore}
                AND m.ChangeTime BETWEEN '${timestampToYMDHIS2(Number(st))}' AND '${timestampToYMDHIS2(Number(et))}'
                AND m.ProcGroup='${procg}' 
                AND m.ProcNameE='${procc}'
                AND r.Classify IN (${classifyFilter})
                AND m.LotType IN (${ltp})
            `;
            }

            return queryFunc(connection, sqlStr)
        })
        .then((result) => {

            res.json(result);

        })
        .catch((err) => {
            console.log(err);
        });

});

router.get('/aoitrendparams', (req, res) => { ///料號清單

    mysqlConnection(configFunc('paoi'))
        .then((connection) => {

            // const sqlProdClass = `SELECT DISTINCT ProdClass FROM aoi_trend_rate WHERE ProdClass<>''`;
            const sqlPartNo = `SELECT DISTINCT PartNo FROM aoi_trend_rate WHERE LEFT(PartNo,4)<>'UMGL'`;
            const sqlLottype = `SELECT DISTINCT LotType FROM aoi_trend_machine`;
            const sqlClassify = `SELECT DISTINCT Classify FROM aoi_trend_rate ORDER BY Classify`;
            const sqlprocgroup = `SELECT DISTINCT ProcGroup FROM aoi_trend_machine`;

            return Promise.all([
                // queryFunc(connection, sqlProdClass),
                queryFunc(connection, sqlPartNo),
                queryFunc(connection, sqlLottype),
                queryFunc(connection, sqlClassify),
                queryFunc(connection, sqlprocgroup),

            ])
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/aoitrnedprogroup/:layer', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const { layer } = req.params;
            let sqlStr = '';
            if (layer === 'BU') {
                sqlStr = `SELECT DISTINCT ProcGroup FROM aoi_trend_machine WHERE MatchLayer<>'1'`;
            } else {
                sqlStr = `SELECT DISTINCT ProcGroup FROM aoi_trend_machine WHERE MatchLayer='1' `;
            }
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
})

router.get('/aoitrendprocname/:procgroup', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const { procgroup } = req.params;

            const sqlStr = `SELECT DISTINCT ProcNameE FROM aoi_trend_machine WHERE ProcGroup='${procgroup}'`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});


// AOI Daily TOP 3 Defect Trend
// 抓該料號前後各100的點(不一定為該料號)
router.get('/aoitop3trend/:partnum/:lot/:layer/:defect/:count', (req, res) => {

    const saveBUProcess = ['LDLCOL', 'LTHADF', 'LTHDFV', 'LTHSEP', 'PTHCUM', 'PTHFCU', 'SAPECU', 'SAPPEC', 'SAPDEM'];
    const saveABFProcess = ['ABFABF', 'ABFMEC'];
    const saveCoreSProcess = ['PLGVCP', 'LTHDES', 'LTHRAD'];
    const saveCoreEProcess = ['MDL2MDL', 'MDL3MDL', 'MDL4MDL', 'PTH1ELS1', 'PTH2ELS1', 'PTH5ELS1', 'PTH6ELS1', 'PTH1PCU1', 'PTH2PCU1', 'PTH5PCU1', 'PTH6PCU1', 'PLS2DBR1', 'PLS5DBR1', 'PTH1DEM1', 'PTH4DEM1']

    const { partnum, lot, layer, defect, count } = req.params;
    let outerConnection;
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            // 抓當下該批個製程段時間點
            const processBUFilter = `'${saveBUProcess.join("','")}'`;
            const ABFprocessFilter = `'${saveABFProcess.join("','")}'`;

            const processCoreSFilter = `'${saveCoreSProcess.join("','")}'`;
            const processCoreEFilter = `'${saveCoreEProcess.join("','")}'`;

            const layerAry = layer.split('L');
            const layerCheck = ((Number(layerAry[2]) - Number(layerAry[1])) + 1) / 2;
            let sqlStr = '';

            if (layerCheck === 1) { ///Core
                sqlStr = `SELECT * FROM (SELECT ProcNameS,ChangeTime FROM aoi_trend_machine 
                WHERE PartNo='${partnum}' 
                AND LotNum ='${lot}' 
                AND LayerName='${layer}'
                AND ProcNameS IN (${processCoreSFilter})) T 
                UNION ALL
                (
                    SELECT ProcNameE AS ProcNameS,ChangeTime FROM aoi_trend_machine 
                WHERE PartNo='${partnum}' 
                AND LotNum ='${lot}' 
                AND LayerName='${layer}'
                AND ProcNameE IN (${processCoreEFilter})
                )`;
            } else {
                let abfStr = '';
                if (layer === '-Outer') {
                    abfStr = `SELECT ProcNameS,ChangeTime FROM  aoi_trend_machine
                    WHERE PartNo='${partnum}' 
                    AND LotNum ='${lot}' 
                    AND MatchLayer IN (SELECT MAX(CAST(MatchLayer AS real))-1 FROM aoi_trend_machine WHERE PartNo='${partnum}')
                    AND ProcNameS IN (${ABFprocessFilter})`;
                } else {
                    abfStr = `SELECT ProcNameS,ChangeTime FROM aoi_trend_machine
                    WHERE PartNo='${partnum}' 
                    AND LotNum ='${lot}' 
                    AND LayerName='-L${Number(layerAry[1]) + 1}L${Number(layerAry[2]) - 1}'
                    AND ProcNameS IN (${ABFprocessFilter})`;
                };

                sqlStr = `SELECT * FROM (SELECT ProcNameS,ChangeTime FROM aoi_trend_machine 
                WHERE PartNo='${partnum}' 
                AND LotNum ='${lot}' 
                AND LayerName='${layer}' 
                AND ProcNameS IN (${processBUFilter}))T
                UNION All
                (${abfStr})`;
            };
            outerConnection = connection;

            return queryFunc(connection, sqlStr)
        })
        .then((result) => {

            const promiseAry = [];
            result.forEach((r) => {

                const filterStr = r.ProcNameS.length === 6 ? `ProcNameS='${r.ProcNameS}'` : `ProcNameE='${r.ProcNameS}'`;
                const filterColumn = r.ProcNameS.length === 6 ? `m.ProcNameS` : `m.ProcNameE As ProcNameS`;

                const sqlStr = `SELECT * FROM 
                (SELECT m.PartNo,m.LotType,m.LotNum,m.MatchLayer,${filterColumn},m.MachineName,m.ChangeTime,r.LayerName,r.Classify,r.Rate FROM aoi_trend_machine m 
                    INNER JOIN
                aoi_trend_rate r
                ON m.LotNum=r.LotNum AND m.MatchLayer=r.MatchLayer
                WHERE r.Classify='${defect}' 
                AND ${filterStr} 
                AND ChangeTime<'${r.ChangeTime}' ORDER BY ChangeTime DESC LIMIT ${count}) T
                Union ALL
                (SELECT m.PartNo,m.LotType,m.LotNum,m.MatchLayer,${filterColumn},m.MachineName,m.ChangeTime,r.LayerName,r.Classify,r.Rate FROM aoi_trend_machine m
                    INNER JOIN
                aoi_trend_rate r
                ON m.LotNum=r.LotNum AND m.MatchLayer=r.MatchLayer
                WHERE r.Classify='${defect}' 
                AND ${filterStr} 
                AND ChangeTime>='${r.ChangeTime}' ORDER BY ChangeTime ASC LIMIT ${count})
                `;

                promiseAry.push(queryFunc(outerConnection, sqlStr));
            });

            return Promise.all(promiseAry)
        })
        .then((result) => {

            let Ary = [];

            result.forEach((i) => {
                Ary = [...Ary, ...i]
            });

            res.json(Ary);
        })
        .catch((err) => {
            console.log(err);
        });
});

// 
router.get('/mergeedit', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sqlStr = `SELECT  
        COALESCE(e.PartNo,p.PartNo)PartNo,
        COALESCE(e.LotType,p.LotType)LotType,
        COALESCE(e.LotNum,p.LotNum)LotNum,
        COALESCE(e.Layer,p.Layer)Layer,
        COALESCE(e.Yield,p.Yield)Yield,
        COALESCE(e.Bef_Yield,p.Bef_Yield)Bef_Yield,
        COALESCE(e.C_TOP_1,p.C_TOP_1)C_TOP_1,
        COALESCE(e.C_TOP1,p.C_TOP1)C_TOP1,
        COALESCE(e.C_TOP_2,p.C_TOP_2)C_TOP_2,
        COALESCE(e.C_TOP2,p.C_TOP2)C_TOP2,
        COALESCE(e.C_TOP_3,p.C_TOP_3)C_TOP_3,
        COALESCE(e.C_TOP3,p.C_TOP3)C_TOP3,
        COALESCE(e.S_TOP_1,p.S_TOP_1)S_TOP_1,
        COALESCE(e.S_TOP1,p.S_TOP1)S_TOP1,
        COALESCE(e.S_TOP_2,p.S_TOP_2)S_TOP_2,
        COALESCE(e.S_TOP2,p.S_TOP2)S_TOP2,
        COALESCE(e.S_TOP_3,p.S_TOP_3)S_TOP_3,
        COALESCE(e.S_TOP3,p.S_TOP3)S_TOP3,
        COALESCE(e.value,p.value)value FROM ptaoi_yield_defect p LEFT JOIN edit e 
        ON p.LotNum=e.LotNum AND p.Layer=e.Layer`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.get('/editall', (req, res) => {
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sqlStr = `SELECT * FROM edit`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json(result);
        })
        .catch((err) => {
            console.log(err);
        })
});

router.post('/editadd', (req, res) => {

    const { PartNo, LotType, LotNum, Layer, Yield, Bef_Yield, C_TOP_1, C_TOP1, C_TOP_2, C_TOP2, C_TOP_3, C_TOP3, S_TOP_1, S_TOP1, S_TOP_2, S_TOP2, S_TOP_3, S_TOP3, value } = req.body;

    let outerConnection;
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {

            outerConnection = connection;

            const sqlStr = `SELECT * FROM edit WHERE LotNum='${LotNum}' AND Layer='${Layer}'`;

            return queryFunc(outerConnection, sqlStr)
        })
        .then((result) => {

            if (result.length > 0) {
                const sqlStr = `UPDATE edit SET PartNo='${PartNo}',LotType='${LotType}',Yield='${Yield}',Bef_Yield='${Bef_Yield}',C_TOP_1='${C_TOP_1}',C_TOP1='${C_TOP1}',C_TOP_2='${C_TOP_2}',C_TOP2='${C_TOP2}',C_TOP_3='${C_TOP_3}',C_TOP3='${C_TOP3}',S_TOP_1='${S_TOP_1}',S_TOP1='${S_TOP1}',S_TOP_2='${S_TOP_2}',S_TOP2='${S_TOP2}',S_TOP_3='${S_TOP_3}',S_TOP3='${S_TOP3}',value='${value}' 
                WHERE LotNum='${LotNum}' AND Layer='${Layer}'`;
                return queryFunc(outerConnection, sqlStr);
            } else {
                const sqlStr = `INSERT INTO edit
            (PartNo, LotType, LotNum, Layer, Yield, Bef_Yield, C_TOP_1, C_TOP1, C_TOP_2, C_TOP2, C_TOP_3, C_TOP3, S_TOP_1, S_TOP1, S_TOP_2, S_TOP2, S_TOP_3,S_TOP3, value) 
            VALUES 
            ('${PartNo}', '${LotType}', '${LotNum}', '${Layer}', '${Yield}', '${Bef_Yield}', '${C_TOP_1}', '${C_TOP1}', '${C_TOP_2}', '${C_TOP2}', '${C_TOP_3}', '${C_TOP3}', '${S_TOP_1}', '${S_TOP1}', '${S_TOP_2}', '${S_TOP2}', '${S_TOP_3}','${S_TOP3}', '${value}')`;
                return queryFunc(outerConnection, sqlStr)
            }

        })
        .then((result) => {
            res.json({ message: '更新成功', status: true });
        })
        .catch((err) => {
            res.json({ message: '更新失敗', status: false });
        })
});

router.delete('deleteedit/:lot/:layer', (req, res) => {
    const { lot, layer } = req.params
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sqlStr = `DELETE FROM edit WHERE LotNum='${lot}' AND Layer='${layer}'`;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            res.json({ message: '刪除成功', stats: false })
        })
        .catch((err) => {
            res.json({ message: '刪除失敗', stats: false })
        })
});
//SELECT `PartNum`,`LayerName`,`LotNum`,`ChkInTime`, avg(AlarmPoint_sum) AS AlarmPoint_avg FROM( select `PartNum`,`LayerName`,`LotNum`,`ChkInTime`,`BoardNo`, sum(AlarmPoint) as AlarmPoint_sum from( SELECT `PartNum`,`LayerName`,`LotNum`,`ChkInTime`,`BoardNo`, Side, cast(`AlarmPoint` as DECIMAL(10,0)) as AlarmPoint FROM `alarmpoint` ) as dt GROUP BY `PartNum`,`LayerName`,`LotNum`,`ChkInTime`,`BoardNo` ) as dt2 GROUP BY `PartNum`,`LayerName`,`LotNum`,`ChkInTime`;

router.get('/aoiappoint/:st/:et', (req, res) => {
    const { st, et } = req.params
    // console.log(timestampToYMDHIS3(parseFloat(st)) ,"   ",timestampToYMDHIS3(parseFloat(et)))
    mysqlConnection(configFunc('paoi'))
        .then((connection) => {
            const sqlStr = `SELECT dt3.*, pd.ProdClass
            from(
                SELECT dt2.PartNum,dt2.LayerName,dt2.LotNum,dt2.ChkInTime,avg(AlarmPoint_sum) AS AlarmPoint_avg,  count(AlarmPoint_sum) AS AlarmPoint_count 
                FROM( 
                    select PartNum,LayerName,LotNum,ChkInTime,BoardNo, sum(AlarmPoint) as AlarmPoint_sum 
                    from( 
                        SELECT PartNum,LayerName,LotNum,ChkInTime,BoardNo, Side, cast(AlarmPoint as DECIMAL(10,0)) as AlarmPoint 
                        FROM alarmpoint ) as dt 
                    GROUP BY PartNum,LayerName,LotNum,ChkInTime,BoardNo ) as dt2 
                where ChkInTime > '${timestampToYMDHIS3(parseFloat(st))}' and ChkInTime<'${timestampToYMDHIS3(parseFloat(et))}' 
                GROUP BY PartNum,LayerName,LotNum,ChkInTime
            ) as dt3
            left join (select distinct ProdClass, PartNo from ptaoi_yield_defect) pd on dt3.Partnum = pd.PartNo
        `;
            return queryFunc(connection, sqlStr)
        })
        .then((result) => {
            const PN =[...new Set(result.map(i=>i.PartNum).sort((a,b)=>a.substring(5, 7)-b.substring(5, 7)).sort((a,b)=>a.substring(4, 5)-b.substring(4, 5)).sort((a,b)=>a.substring(0, 4)-b.substring(0, 4)))]
            let PNDevice=[]
            const Device =[...new Set(result.map(i=>i.ProdClass).sort((a,b)=>a-b))]
            // PN.forEach(function (item, index) {
            //     const de=[...new Set(result.filter((i) => i.PartNum === item).map((i) => i.ProdClass))]
            //     PNDevice[index] = {
            //       name: item,
            //       Device: de[0],
            //     };
            //   });
            // console.log(PN)
            // console.log(Device)
            res.json({Alarm:result,Device:Device})
        })
        .catch((err) => {
            console.log(err)
            // res.json(err)
        })
});


//
router.get('/aoiLotSearch/:lotnum/:layer', async (req, res) => {
    try {
        const connection = await mysqlConnection(configFunc("paoi"));
        const { lotnum, layer } = req.params;
        const sql = `SELECT * FROM ptaoi_yield_defect WHERE LotNum='${lotnum}' AND Layer='${layer}'`
        const data = await queryFunc(connection, sql);
        await connection.end();
        res.json(data)
    } catch (err) {
        console.log(err)
    }

})


module.exports = router
