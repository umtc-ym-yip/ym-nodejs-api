const express = require('express');
const router = express.Router();

const SFTPClient = require('ssh2-sftp-client');
const genericPool = require('generic-pool');

router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
    res.setHeader('Access-Control-Allow-Header', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

const factory = {
    create() {
        let sftp = new SFTPClient();
        return sftp.connect({
            host: '10.23.60.3',
            port: 22,
            username: 'Lthmanager_user',
            password: '1qazXSW@user',
        })
            .then(() => sftp);

    },
    destroy(sftp) {
        return sftp.end()
    }
};
const opts = {
    max: 10,
    min: 2
};
const sftpPool = genericPool.createPool(factory, opts);
module.exports = sftpPool;
