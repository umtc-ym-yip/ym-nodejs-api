const express = require('express');
const path = require('path');
const XLSX = require('xlsx');
const mongodb = require('mongodb');
const cron = require('node-cron');
const { hostname } = require('os');
const { poolDc,
    poolAcme,
    poolNCN } = require('./mssql.js')


const app = express();
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-type,Accept,X-Access-Token,X-Key,Authorization');////Content-Type,Authorization
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});
app.use(express.static(path.join(__dirname, 'dashboard')));

app.get('/dashboard/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

app.get('/', (req, res) => {
    res.send('Hello');
});



// 提供API
app.use('/aoi', require('./router/aoi.js'));
app.use('/api', require('./router/api.js'));
// app.use('/dailyapi', require('./daily/dailyApi.js'));

app.use('/mask', require('./router/mask.js'));
app.use('/vi', require('./router/vi.js'));
app.use('/user', require('./router/user.js'));
app.use('/oay', require('./router/oay.js'));
app.use('/ost', require('./router/ost.js'));
app.use('/product', require('./router/product.js'));
app.use('/wip', require('./router/wip.js'));
app.use('/fm', require('./router/fm.js'));
app.use('/fli', require('./router/fli.js'));
app.use('/wpg',require('./router/wpg.js'))
app.use('/bump',require('./router/bump.js'))
app.use('/sawshift',require('./router/sawshift.js'))
app.use('/trytest',require('./router/trytest.js'))
app.use('/hold', require('./router/hold.js'));
app.use('/spc', require('./router/spc.js'));
//導入每日上拋function module
const { dailyAdd, stackAdd } = require('./daily/dailyFunc.js');
const { default: axios } = require('axios');
//

// 每日更新API
app.use('/daily/cc', require('./daily/cc.js'));
app.use('/daily/vi', require('./daily/vi.js'));
app.use('/daily/oay', require('./daily/oay.js'));
app.use('/daily/fixed', require('./daily/fixed.js'));
app.use('/daily/ost', require('./daily/ost.js'));
app.use('/daily/aoi', require('./daily/aoi.js'));
app.use('/daily/wip', require('./daily/wip.js'));
app.use('/daily/wpg', require('./daily/wpg.js'));
app.use('/daily/eis', require('./daily/eis.js'));
app.use('/daily/fli', require('./daily/fli.js'));
app.use('/daily/bump', require('./daily/bump.js'));
app.use('/daily/sawshift',require('./daily/sawshift.js'))
// 

cron.schedule('15 59 15 * * *', async () => {
    const url = 'http://localhost:8000';

    //VI
    // for(let i=0;i<2;i++){
    //     await stackAdd(`${url}/daily/vi/weeklystack/${i}`);
    // }
    //Vi

    //FLI
    // await stackAdd(`${url}/daily/fli/dailyadd`);
    //Bump
    // await stackAdd(`${url}/daily/bump/dailyadd`);
});



cron.schedule('50 41 10 * * *', async () => {
    const url = 'http://localhost:8000';
    console.log('run')
    // await stackAdd(`${url}/daily/bump/bumpInLineadd/1/2`);
    // await stackAdd(`${url}/daily/aoi/sndailyadd`);
    // for(let i=1;i<50;i++){
    // await stackAdd(`${url}/daily/bump/bumpInLineadd/${i}/1`);
    // }
    // await stackAdd(`${url}/daily/vi/ipqc`)

    // for(let i=-1;i<3;i++){
    //     await stackAdd(`${url}/daily/eis/bumpinlineyield/${i}/0`);
    //     await stackAdd(`${url}/daily/eis/bumpinlineyield/${i}/6`);
    //     await stackAdd(`${url}/daily/eis/bumpinlineyield/${i}/12`);
    //     await stackAdd(`${url}/daily/eis/bumpinlineyield/${i}/18`);
        
    // }
    // await stackAdd(`${url}/daily/aoi/dailyadd`);
    // for(let i=-1;i<10;i++){
    //     await stackAdd(`${url}/daily/sawshift/daily/${i}/8`);
    //     await stackAdd(`${url}/daily/sawshift/daily/${i}/16`);
    //     await stackAdd(`${url}/daily/sawshift/daily/${i-1}/0`);
        // await stackAdd(`${url}/daily/sawshift/addquadvia`);
        // await stackAdd(`${url}/daily/sawshift/addquadpad`);
        
    // }
    // await stackAdd(`${url}/daily/sawshift/addquadvia`);
    // await stackAdd(`${url}/daily/sawshift/addquadpad`);
    //AOI
    //  await stackAdd(`${url}/daily/aoi/dailyadd`);

//     // FLI
    // await stackAdd(`${url}/daily/fli/dailyadd`);

//     // OST
    // await stackAdd(`${url}/daily/ost/dailyadd`);
//     await stackAdd(`${url}/daily/ost/weeklystack`);

//     // CC
    // await stackAdd(`${url}/daily/cc/dailyadd`);
    // await stackAdd(`${url}/daily/cc/weeklystack`);

//     // // VI
    // await stackAdd(`${url}/daily/vi/daily`)
    //  await dailyAdd(`${url}/daily/vi/weeklystack`);
     await stackAdd(`${url}/daily/vi/ipqc`);
//     await stackAdd(`${url}/daily/vi/vrs2daily`);
//     await stackAdd(`${url}/daily/vi/vrs2excel`);
    

//     // Fixed
//     // await dailyAdd(`${url}/daily/fixed/aoimask`);
//     // await dailyAdd(`${url}/daily/fixed/aoipanel`);

    
//    //WPG
    // await stackAdd(`${url}/daily/wpg/dailyadd`);
    // await stackAdd(`${url}/daily/bump/dailyadd`);
    
    // await stackAdd(`${url}/daily/aoi/sndailyadd`);

//     //OAY
    // await dailyAdd(`${url}/daily/oay/oayyield`);
    // await dailyAdd(`${url}/daily/oay/oayyieldt`);

//     // EIS 
    
    // await dailyAdd(`${url}/daily/eis/EisEventAutoMylarPeeler`); // Event AutoMylarPeeler
    // await dailyAdd(`${url}/daily/eis/Particle_Day`); // Particle_Day
    // await dailyAdd(`${url}/daily/eis/ldlstage`); // LDL Stage
});

cron.schedule('50 50 13 * * *', async () => {
    const url = 'http://localhost:8000';
     //OAY
    console.log('開始')
    // await stackAdd(`${url}/daily/wpg/dailyadd`);
    // await stackAdd(`${url}/daily/vi/daily`)
    // await stackAdd(`${url}/daily/aoi/sndailyadd`);
    // await stackAdd(`${url}/daily/bump/mpxmpy`)
    // for(let i=-1;i<400;i++){  
    //     await stackAdd(`${url}/daily/bump/dailyadd/${i}`);
    // }
        // CC
    // await stackAdd(`${url}/daily/cc/dailyadd`);
    // await stackAdd(`${url}/daily/cc/weeklystack`);
    // await dailyAdd(`${url}/daily/oay/test`);
    // await dailyAdd(`${url}/daily/oay/oayyield`);
    // await dailyAdd(`${url}/daily/oay/oayyieldt`);
    // await stackAdd(`${url}/daily/vi/ipqc`);
    // await stackAdd(`${url}/daily/vi/daily`)
    // await stackAdd(`${url}/daily/vi/vrs2daily`);
    // await stackAdd(`${url}/daily/vi/vrs2excel`);
});



cron.schedule('54 09 15 * * *', async () => {
    const url = 'http://localhost:8000';
    console.log('run')
    // await stackAdd(`${url}/daily/sawshift/daily/0/8`);
    // // await stackAdd(`${url}/daily/sawshift/daily/0/16`);
    // // await stackAdd(`${url}/daily/sawshift/daily/0/0`);
    // await stackAdd(`${url}/daily/sawshift/addquadvia`);
    // await stackAdd(`${url}/daily/sawshift/addquadpad`);
//     // CC
    // await stackAdd(`${url}/daily/cc/dailyadd`);
//     await stackAdd(`${url}/daily/cc/weeklystack`);


});

// cron.schedule('10 17 * * *', async () => {
//     const url = 'http://localhost:8000';
//     await dailyAdd(`${url}/daily/eis/ldlstage`); // LDL Stage
// });
cron.schedule('*/10 * * * *', async () => {
    const url = 'http://localhost:8000';

    // await stackAdd(`${url}/daily/wip/wipupdate`);
    // await stackAdd(`${url}/daily/aoi/trenddata`);
})




cron.schedule('19 15 * * MON', async () => {
    // Week Update
    const url = 'http://localhost:8000';
    //CC
    // await dailyAdd(`${url}/daily/cc/dailyadd`);
    //VI
    // await stackAdd(`${url}/daily/vi/daily`)
    // await dailyAdd(`${url}/daily/vi/weeklystack`);
    // await dailyAdd(`${url}/daily/vi/ipqc`);
    // await stackAdd(`${url}/daily/vi/vrs2daily`);
    // await stackAdd(`${url}/daily/vi/vrs2excel`);

    // await stackAdd(`${url}/daily/cc/weeklystack`);
    // await stackAdd(`${url}/daily/aoi/sndailyadd`);
    // await stackAdd(`${url}/daily/oay/oayyield`);
    // await stackAdd(`${url}/daily/fli/dailyadd`);
    // Eis  
     //await dailyAdd(`${url}/daily/eis/Particle_Week`); // Particle_Week
     
});






const mongoURI = "mongodb://datamationYM:P%40ssw0rd@utcymmgs01.unimicron.com:27017/?authSource=DatamationYM_AIOT";
const client = new mongodb.MongoClient(mongoURI);
// mongodb://datamationYM:P%40ssw0rd@utcymmgs01.unimicron.com:27017/?authSource=DatamationYM_AIOT
////, { useNewUrlParser: true, useUnifiedTopology: true }

app.get('/TEST', async (req, res) => {
    try {

        let day = new Date();
        day.setDate(day.getDate() - 30);

        await client.connect();
        const mangos = await client
            .db('DatamationYM_AIOT')
            .collection('HD')
            .aggregate([
                {
                    $match: {
                        EQNo: 'SYM0120'
                    }
                }
                ,
                {
                    $sort: {
                        Inserttime: -1
                    }
                },
                {
                    $limit: 10000
                }
                ,
                {
                    $group: {
                        _id: null,
                        unique: { $addToSet: '$Addres' }
                    }
                }])
            .toArray();

        res.json(mangos);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'An error occurred' });
    } finally {
        client.close();
    }
});


app.get('/tt', (req, res) => {
    const filePath = '//Wymd10524/yip共用區/1.RKL LRD大表/對外大表V1-20230817.xlsx';
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames.filter((item) => item.substring(item.length - 2, item.length) === '大表');
    const sheetData = sheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        return { sheetName, data: jsonData }
    });///[{},{},{}]
    res.json(sheetData);
});

app.get('/OSAT', (req, res) => {
    const filePath = '//Wymd10524/yip共用區/1.RKL LRD大表/OSAT對外大表-20231219.xlsx';
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames.filter((item) => item.substring(item.length - 2, item.length) === '大表');
    const sheetData = sheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        return { sheetName, data: jsonData }
    });///[{},{},{}]
    res.json(sheetData);
});
app.get('/tt1', (req, res) => {
    const filePath = '//Wym2a10214/yip共用區/7.每日更新 WIP/RKL追追追追不完/RPA/WIP lot tracking list-0517.xlsx';
    const a=['ADL ','Server','EMIB','RPL','TV.Client','Meteor lake'];
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames.filter((item) => a.includes(item));
    const sheetData = sheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        const YIPfilter=jsonData.filter((item) => item.filter((i) => { return i.toString().includes('YIP')}).length !== 0)
        console.log(YIPfilter)
        return { data: YIPfilter }
    });///[{},{},{}]

    res.json(sheetData);
});


// const hostname='10.22.87.87';
Promise.all([
    poolDc.connect(),
    poolAcme.connect(),
    poolNCN.connect()
])
    .then(() => {

        app.listen('8000', hostname, () => {
            console.log(`Server is listening at http://${hostname}:8000`);
        });
    });

process.on('exit', () => {
    poolDc.close();
    poolAcme.close();
    poolNCN.close();
});
