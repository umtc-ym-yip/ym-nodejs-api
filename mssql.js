const express = require("express");
const sql = require("mssql");

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

const configSPC = {
  server: "10.22.65.134",
  user: "ymyip",
  password: "5CQPBcyE",
  database: "SPC_Unimicron",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 3000000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configMaterialYM = {
  server: "UTCYMEDCLSNR01",
  user: "ymyip",
  password: "pr&rZw93",
  database: "Material_YM",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 3000000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configDc = {
  server: "10.22.65.120",
  user: "dc",
  password: "dc",
  database: "dc",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configDchold = {
  server: "UTCYMACMT02",
  user: "dc",
  password: "dc",
  database: "dc",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configAcme = {
  server: "10.22.65.120",
  user: "dc",
  password: "dc",
  database: "acme",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 600000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configNCN = {
  server: "10.22.65.134",
  user: "ymyip",
  password: "5CQPBcyE",
  database: "NCN",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configNCNTest = {
  server: "10.22.65.134",
  user: "ymyip",
  password: "5CQPBcyE",
  database: "NCN_TEST",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configBga = {
  server: "Utcsycimdw01",
  user: "Pc_user",
  password: "Aa12345",
  database: "bga_eda",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};

const configEdc = {
  server: "10.22.66.37",
  user: "EDC_reader",
  password: "e@Iu(E08",
  database: "YM_EDC",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};
const configMetrology = {
  server: "10.22.66.37",
  user: "ymyip",
  password: "pr&rZw93",
  database: "YM_Metrology",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 3000000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};
const configSNAcme = {
  server: "UTCSNACMLSNR",
  user: "dc_read",
  password: "ewFJ9%(4",
  database: "acme",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};
const configSNDc = {
  server: "UTCSNACMLSNR",
  user: "dc_read",
  password: "ewFJ9%(4",
  database: "dc",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 300000,
  },
  pool: {
    max: 10000,
    min: 0,
    idleTimeoutMillis: 3000000,
  },
};
const poolDchold = new sql.ConnectionPool(configDchold);
poolDchold
  .connect()
  .then(() => {
    console.log("sql server SPC connection done!");
  })
  .catch((err) => {
    console.log(err);
  });

const poolSPC = new sql.ConnectionPool(configSPC);
poolSPC
  .connect()
  .then(() => {
    console.log("sql server SPC connection done!");
  })
  .catch((err) => {
    console.log(err);
  });

const poolMaterialYM = new sql.ConnectionPool(configMaterialYM);
  poolMaterialYM
    .connect()
    .then(() => {
      console.log("sql server MaterialYM connection done!");
    })
    .catch((err) => {
      console.log(err);
    });

const poolDc = new sql.ConnectionPool(configDc);
poolDc
  .connect()
  .then(() => {
    console.log("sql server dc connection done!");
  })
  .catch((err) => {
    console.log(err);
  });

const poolAcme = new sql.ConnectionPool(configAcme);
poolAcme
  .connect()
  .then(() => {
    console.log("sql server acme connection done!");
  })
  .catch((err) => {
    console.log(err);
  });
const poolNCNTest = new sql.ConnectionPool(configNCNTest);
poolNCNTest
  .connect()
  .then(() => {
    console.log("sql server NCN connection done!");
  })
  .catch((err) => {
    console.log(err);
  });

const poolNCN = new sql.ConnectionPool(configNCN);
poolNCN
  .connect()
  .then(() => {
    console.log("sql server acme connection done!");
  })
  .catch((err) => {
    console.log(err);
  });

const poolBga = new sql.ConnectionPool(configBga);
poolBga
  .connect()
  .then(() => {
    console.log("sql server bga connection done!");
  })
  .catch((err) => {
    console.log(err);
  });

const poolEdc = new sql.ConnectionPool(configEdc);
poolEdc
  .connect()
  .then(() => {
    console.log("sql server edc connection done!");
  })
  .catch((err) => {
    console.log(err);
  });
const poolMetrology = new sql.ConnectionPool(configMetrology);
poolMetrology
  .connect()
  .then(() => {
    console.log("sql server Metrology connection done!");
  })
  .catch((err) => {
    console.log(err);
  });
const poolSNAcme = new sql.ConnectionPool(configSNAcme);
poolSNAcme.connect().then(() => {
  console.log("sql server SN Acme connection done!");
});

const poolSNDc = new sql.ConnectionPool(configSNDc);
poolSNDc.connect().then(() => {
  console.log("sql server SN Dc connection done!");
});

const poolObj = {
  poolDc,
  poolAcme,
  poolNCN,
  poolBga,
  poolEdc,
  poolMetrology,
  poolSNAcme,
  poolSNDc,
  poolSPC,
  poolDchold,
  poolNCNTest,
  poolMaterialYM,
};
module.exports = poolObj;
