const mysql = require('mysql2');
const axios = require('axios');

const { mysqlConnection, queryFunc } = require('../mysql');
const { configFunc } = require('../config');

const addtoDB = (db, sql, values) => {

    return new Promise((resolve, reject) => {
        mysqlConnection(configFunc(db))
            .then((connection) => {
                return queryFunc(connection, sql, [values])
            })
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            })
    })
};

const gettoDB = (db, sql) => {
    return new Promise((resolve, reject) => {
        mysqlConnection(configFunc(db))
            .then((connection) => {
                return queryFunc(connection, sql)
            })
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            })
    })
}

const dailyAdd = (api) => {
    return axios.get(api)
        .then((res) => {

            if (res.data.status === false) {
                throw new Error(res.data.message);
            };

            const keys = Object.keys(res.data);


            const promiseAry = [];
            keys.forEach((k) => {
                const { data, db, table } = res.data[k];

                if(data.length!==0){
                    const columns = Object.keys(data[0]);
                    const values = data.map((i) => Object.values(i));
                    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ?`;

                    promiseAry.push(addtoDB(db, sql, values));
                }else{
                    console.log(`${api} ${k} 無資料新增`);
                }


            });

            return Promise.all(promiseAry);


        })
        .then((results) => {
            results.forEach((r) => {
                console.log(`${api} 新增 ${r.affectedRows} 筆資料`);
            })
        })
        .catch((err) => {
            console.log(`${api} 無資料新增`, err);
            //console.log(`${api} 無資料新增`);
        });

};

const stackAdd = (api) => {

    return axios.get(api)
        .then((res) => {
            if (res.data.status === false) {
                throw new Error(res.data.message);
            };
            const keys = Object.keys(res.data);
            const promiseAry = [];

            keys.forEach((k) => {
                const { data, db, table, match } = res.data[k];

                if (data.length === 0) {
                    console.log(`<${k} Not Readout>`);
                } else {
                    const columns = Object.keys(data[0]);
                    let matchColumn = match
                        .filter(col => col !== 'Remark')
                        .map((i) => `${i} = VALUES(${i})`)
                        .join(",");
                    
                    // 如果存在 Remark 欄位，在更新語句中將其設置為原值
                    if (columns.includes('Remark')) {
                        matchColumn += ', Remark = Remark';
                    }

                    const values = data.map((i) => Object.values(i));

                    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ?
                    ON DUPLICATE KEY UPDATE ${matchColumn}`;
                    // console.log(sql)
                    promiseAry.push(addtoDB(db, sql, values));
                }

            });

            // 在循環結束後，檢查是否有任何數據被處理
            if (promiseAry.length === 0) {
                console.log("無資料新增");
            }

            return Promise.all(promiseAry);

        })
        .then((results) => {
            results.forEach((r) => {
                console.log(`${api} 新增 ${r.affectedRows} 筆資料`);
            })
        })
        .catch((err) => {
            console.log(`${api} 無資料新增`, err);
        });

}







// const dailyUpdate=async(api,db,table,matchAry)=>{
//     const connection = mysql.createConnection({
//         host: '10.22.94.222',
//         user: 'user_marvin',
//         password: 'pwd123',
//         database: db
//     });

//     try {

//         const res = await axios.get(api);
//         const data = res.data;

//         if (data.length > 0) {

//             const firstData = data[0];

//             const columns = Object.keys(firstData).map(column=>`${column}=?`).join(',');
//             const matchColumn=matchAry.map((col)=>`${col}=?`).join(' and ');

//             const sql = `UPDATE ${table} SET ${columns} WHERE ${matchColumn} `;


//             const updatePromises=data.map((i)=>{
//                 const values=Object.values(i);
//                 const match=matchAry.map((key)=>i[key]);
//                 return connection.execute(sql,[...values,...match],(err,result)=>{
//                     console.log('r',result)
//                 })
//             });

//             const r=await Promise.allSettled(updatePromises);
//             r.forEach((res)=>console.log('t',res));
//             // results.forEach((res)=>console.log(res.value))

//             const dataCount = data.length;
//             const time = await nowTime();

//             console.log(`${api} 更新${dataCount}筆資料完成(${time})`);
//             console.log('==========================================');
//         } else {
//             console.log(`${api} 沒資料`)
//         }
//     } catch (error) {
//         console.log(error);
//     } finally {
//         connection.end();
//     }
// }

// const updatetoDB = async (connection, sql, values,match) => {
//     console.log('tt',[...values,...match]);
//     return new Promise((resolve, reject) => {
//         connection.query(sql, [...values,...match], (error, results) => {
//             if (error) {
//                 reject(error)
//             } else {
//                 resolve(results)
//             }
//         })
//     })
// };







module.exports = {
    dailyAdd,
    stackAdd
    // dailyUpdate
};
