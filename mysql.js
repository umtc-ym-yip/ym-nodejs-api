const mysql = require('mysql2');

const mysqlConnection = (config) => {
    return new Promise((resolve, reject) => {
        const connection = mysql.createConnection(config);
        connection.connect((err) => {
            if (err) { reject(err) }
            else {
                resolve(connection)
            }
        })
    })
};

const queryFunc=(connection,sql,data)=>{
    return new Promise((resolve, reject) => {
        connection.query(sql,data, (err, results) => {
            if (err) { reject(err) } else {
                resolve(results)
            }
        })
    })
};

module.exports={
    mysqlConnection,
    queryFunc
};