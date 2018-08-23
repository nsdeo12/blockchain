'use strict';

const express = require('express');
const app = express();
const port = 4000;

//necessary modules
var path = require('path');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var request = require('request');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var bodyParser = require('body-parser');
var parseJson = require('parse-json');



//use the pulled modules
app.use(morgan('dev'));
app.use(cors());
app.use(bodyParser.urlencoded({
    'extended': 'true'
})); // parse application/x-www-form-urlencoded
app.use(bodyParser.json()); // parse application/json
app.use(bodyParser.json({
    type: 'application/vnd.api+json'
})); // parse application/vnd.api+json as json




var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var path = require('path');
var util = require('util');
var os = require('os');

//
var fabric_client = new Fabric_Client();
var fabric_ca_client = null;
var admin_user = null;
var member_user = null;
var channel = fabric_client.newChannel('mychannel');
var store_path = path.join(__dirname, 'hfc-key-store');
console.log(' Store path:' + store_path);





//////////////////////////////////////////////////////
////////setup the fabric network starts //////////////
//////////////////////////////////////////////////////


var peer = fabric_client.newPeer('grpc://localhost:7051');
channel.addPeer(peer);
var order = fabric_client.newOrderer('grpc://localhost:7050')
channel.addOrderer(order);

//////////////////////////////////////////////////////
////////setup the fabric network ends/////////////////
//////////////////////////////////////////////////////


//////////////////////////////////////////////////////
////////  enroll user starts  ////////////////////////
//////////////////////////////////////////////////////
app.get('/enrolAdmin', function (req, res) {


    // create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting

    Fabric_Client.newDefaultKeyValueStore({
        path: store_path
    }).then((state_store) => {
        // assign the store to the fabric client
        fabric_client.setStateStore(state_store);
        var crypto_suite = Fabric_Client.newCryptoSuite();
        // use the same location for the state store (where the users' certificate are kept)
        // and the crypto store (where the users' keys are kept)
        var crypto_store = Fabric_Client.newCryptoKeyStore({
            path: store_path
        });
        crypto_suite.setCryptoKeyStore(crypto_store);
        fabric_client.setCryptoSuite(crypto_suite);
        var tlsOptions = {
            trustedRoots: [],
            verify: false
        };
        // be sure to change the http to https when the CA is running TLS enabled
        fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', tlsOptions, 'ca.example.com', crypto_suite);

        // first check to see if the admin is already enrolled
        return fabric_client.getUserContext('admin', true);
    }).then((user_from_store) => {
        if (user_from_store && user_from_store.isEnrolled()) {
            console.log('Successfully loaded admin from persistence');
            admin_user = user_from_store;
            return null;
        } else {
            // need to enroll it with CA server
            return fabric_ca_client.enroll({
                enrollmentID: 'admin',
                enrollmentSecret: 'adminpw'
            }).then((enrollment) => {
                console.log('Successfully enrolled admin user "admin"');
                return fabric_client.createUser({
                    username: 'admin',
                    mspid: 'Org1MSP',
                    cryptoContent: {
                        privateKeyPEM: enrollment.key.toBytes(),
                        signedCertPEM: enrollment.certificate
                    }
                });
            }).then((user) => {
                admin_user = user;

                return fabric_client.setUserContext(admin_user);
            }).catch((err) => {
                console.error('Failed to enroll and persist admin. Error: ' + err.stack ? err.stack : err);
                throw new Error('Failed to enroll admin');
            });
        }
    }).then(() => {
        res.send(admin_user.toString());
        console.log('Assigned the admin user to the fabric client ::' + admin_user.toString());
    }).catch((err) => {
        console.error('Failed to enroll admin: ' + err);
    });
})

//////////////////////////////////////////////////////
////////  enroll user ends  //////////////////////////
//////////////////////////////////////////////////////



//////////////////////////////////////////////////////
////////  register user starts  //////////////////////
//////////////////////////////////////////////////////
app.post('/registerUser/:userName', function (req, res) {
    let userRegistered=req.params.userName;
    console.log("user name",userRegistered);
    
    // create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
    Fabric_Client.newDefaultKeyValueStore({
        path: store_path
    }).then((state_store) => {
        // assign the store to the fabric client
        fabric_client.setStateStore(state_store);
        var crypto_suite = Fabric_Client.newCryptoSuite();
        // use the same location for the state store (where the users' certificate are kept)
        // and the crypto store (where the users' keys are kept)
        var crypto_store = Fabric_Client.newCryptoKeyStore({
            path: store_path
        });
        crypto_suite.setCryptoKeyStore(crypto_store);
        fabric_client.setCryptoSuite(crypto_suite);
        var tlsOptions = {
            trustedRoots: [],
            verify: false
        };
        // be sure to change the http to https when the CA is running TLS enabled
        fabric_ca_client = new Fabric_CA_Client('http://localhost:7054', null, '', crypto_suite);

        // first check to see if the admin is already enrolled
        return fabric_client.getUserContext('admin', true);
    }).then((user_from_store) => {
        if (user_from_store && user_from_store.isEnrolled()) {
            console.log('Successfully loaded admin from persistence');
            admin_user = user_from_store;
        } else {
            throw new Error('Failed to get admin.... run enrollAdmin.js');
        }

        // at this point we should have the admin user
        // first need to register the user with the CA server
        return fabric_ca_client.register({
            enrollmentID: userRegistered,
            affiliation: 'org1.department1',
            role: 'client'
        }, admin_user);
    }).then((secret) => {
        // next we need to enroll the user with CA server
        console.log('Successfully registered user1 - secret:' + secret);

        return fabric_ca_client.enroll({
            enrollmentID: userRegistered,
            enrollmentSecret: secret
        });
    }).then((enrollment) => {
        console.log('Successfully enrolled member user "user1" ');
        return fabric_client.createUser({
            username: userRegistered,
            mspid: 'Org1MSP',
            cryptoContent: {
                privateKeyPEM: enrollment.key.toBytes(),
                signedCertPEM: enrollment.certificate
            }
        });
    }).then((user) => {
        member_user = user;
        res.send(user.toString());
        return fabric_client.setUserContext(member_user);
    }).then(() => {

        console.log(userRegistered,' was successfully registered and enrolled and is ready to intreact with the fabric network');

    }).catch((err) => {
        res.send('Failed to register: ' + err);
        console.error('Failed to register: ' + err);
        if (err.toString().indexOf('Authorization') > -1) {
            console.error('Authorization failures may be caused by having admin credentials from a previous CA instance.\n' +
                'Try again after deleting the contents of the store directory ' + store_path);

        }
    });


});

//////////////////////////////////////////////////////
////////  register user ends  ////////////////////////
//////////////////////////////////////////////////////

//////////////////////////////////////////////////////
////////  invoke chaincode starts  ///////////////////
//////////////////////////////////////////////////////





app.post('/invokeChainCode', function (req, res) {
    var reqBody = req.body;
    console.log("request body", reqBody.args, "fcn", reqBody.fcn);


    // // setup the fabric network          //moved up |^

    // var peer = fabric_client.newPeer('grpc://localhost:7051');
    // channel.addPeer(peer);
    // var order = fabric_client.newOrderer('grpc://localhost:7050')
    // channel.addOrderer(order);


    var tx_id = null;


    Fabric_Client.newDefaultKeyValueStore({
        path: store_path
    }).then((state_store) => {
        // assign the store to the fabric client
        fabric_client.setStateStore(state_store);
        var crypto_suite = Fabric_Client.newCryptoSuite();
        // use the same location for the state store (where the users' certificate are kept)
        // and the crypto store (where the users' keys are kept)
        var crypto_store = Fabric_Client.newCryptoKeyStore({
            path: store_path
        });
        crypto_suite.setCryptoKeyStore(crypto_store);
        fabric_client.setCryptoSuite(crypto_suite);

        // get the enrolled user from persistence, this user will sign all requests
        return fabric_client.getUserContext('user1', true);
    }).then((user_from_store) => {
        if (user_from_store && user_from_store.isEnrolled()) {
            console.log('Successfully loaded user1 from persistence');
            member_user = user_from_store;
        } else {
            throw new Error('Failed to get user1.... run registerUser.js');
        }

        // get a transaction id object based on the current user assigned to fabric client
        tx_id = fabric_client.newTransactionID();
        console.log("Assigning transaction_id: ", tx_id._transaction_id);

        // createCar chaincode function - requires 5 args, ex: args: ['CAR12', 'Honda', 'Accord', 'Black', 'Tom'],
        // changeCarOwner chaincode function - requires 2 args , ex: args: ['CAR10', 'Dave'],
        // must send the proposal to endorsing peers
        //console.log("test body", reqBody.test.toString())
        var request = {
            //targets: let default to the peer assigned to the client
            chaincodeId: 'mycc',
            //fcn: 'openLC',
            fcn: reqBody.fcn,
            //args: ['CAR096','lcReq-090', 'TEst','John','Approved'],
            args: reqBody.args,
            
            //"args":["{\"CAR091\",\"lcReq-090\",\"TEst\",\"John\",\"Approved\" }"],
            chainId: 'mychannel',
            txId: tx_id
        };

        console.log("request===============", request);
        // var request = {
        // 	//targets: let default to the peer assigned to the client
        // 	chaincodeId: 'fabcar',
        // 	fcn: 'changeCarOwner',
        // 	args: ['CAR11', 'Sovy'],
        // 	chainId: 'mychannel',
        // 	txId: tx_id
        // };
        // send the transaction proposal to the peers
        return channel.sendTransactionProposal(request);
    }).then((results) => {
        var proposalResponses = results[0];
        var proposal = results[1];
        let isProposalGood = false;
        if (proposalResponses && proposalResponses[0].response &&
            proposalResponses[0].response.status === 200) {
            isProposalGood = true;
            console.log('Transaction proposal was good');
        } else {
            console.error('Transaction proposal was bad');
        }
        if (isProposalGood) {
            console.log(util.format(
                'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
                proposalResponses[0].response.status, proposalResponses[0].response.message));

            // build up the request for the orderer to have the transaction committed
            var request = {
                proposalResponses: proposalResponses,
                proposal: proposal
            };

            // set the transaction listener and set a timeout of 30 sec
            // if the transaction did not get committed within the timeout period,
            // report a TIMEOUT status
            var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
            var promises = [];

            var sendPromise = channel.sendTransaction(request);
            promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

            // get an eventhub once the fabric client has a user assigned. The user
            // is required bacause the event registration must be signed
            let event_hub = fabric_client.newEventHub();
            event_hub.setPeerAddr('grpc://localhost:7053');

            // using resolve the promise so that result status may be processed
            // under the then clause rather than having the catch clause process
            // the status
            let txPromise = new Promise((resolve, reject) => {
                let handle = setTimeout(() => {
                    event_hub.disconnect();
                    resolve({
                        event_status: 'TIMEOUT'
                    }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
                }, 3000);
                event_hub.connect();
                event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
                    // this is the callback for transaction event status
                    // first some clean up of event listener
                    clearTimeout(handle);
                    event_hub.unregisterTxEvent(transaction_id_string);
                    event_hub.disconnect();

                    // now let the application know what happened
                    var return_status = {
                        event_status: code,
                        tx_id: transaction_id_string
                    };
                    if (code !== 'VALID') {
                        console.error('The transaction was invalid, code = ' + code);
                        resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
                    } else {
                        console.log('The transaction has been committed on peer ' + event_hub._ep._endpoint.addr);
                        resolve(return_status);
                    }
                }, (err) => {
                    //this is the callback if something goes wrong with the event registration or processing
                    reject(new Error('There was a problem with the eventhub ::' + err));
                });
            });
            promises.push(txPromise);

            return Promise.all(promises);
        } else {
            console.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
            throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
        }
    }).then((results) => {
        console.log('Send transaction promise and event listener promise have completed');
        // check the results in the order the promises were added to the promise all list
        if (results && results[0] && results[0].status === 'SUCCESS') {
            console.log('Successfully sent transaction to the orderer.');
        } else {
            console.error('Failed to order the transaction. Error code: ' + response.status);
        }

        if (results && results[1] && results[1].event_status === 'VALID') {
            console.log('Successfully committed the change to the ledger by the peer');
            res.send(results)
        } else {
            console.log('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
        }
    }).catch((err) => {
        console.error('Failed to invoke successfully :: ' + err);
    });
});


//////////////////////////////////////////////////////
////////  invoke chaincode ends  /////////////////////
//////////////////////////////////////////////////////



//////////////////////////////////////////////////////
////////  Query chaincode starts /////////////////////
//////////////////////////////////////////////////////
app.post('/queryChaincode', function (req, res) {
    var reqBody = req.body;
    console.log("query all", reqBody)
    // create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
    Fabric_Client.newDefaultKeyValueStore({
        path: store_path
    }).then((state_store) => {
        // assign the store to the fabric client
        fabric_client.setStateStore(state_store);
        var crypto_suite = Fabric_Client.newCryptoSuite();
        // use the same location for the state store (where the users' certificate are kept)
        // and the crypto store (where the users' keys are kept)
        var crypto_store = Fabric_Client.newCryptoKeyStore({
            path: store_path
        });
        crypto_suite.setCryptoKeyStore(crypto_store);
        fabric_client.setCryptoSuite(crypto_suite);

        // get the enrolled user from persistence, this user will sign all requests
        return fabric_client.getUserContext('user1', true);
    }).then((user_from_store) => {
        if (user_from_store && user_from_store.isEnrolled()) {
            console.log('Successfully loaded user1 from persistence');
            member_user = user_from_store;
        } else {
            throw new Error('Failed to get user1.... run registerUser.js');
        }

        // queryCar chaincode function - requires 1 argument, ex: args: ['CAR4'],
        // queryAllCars chaincode function - requires no arguments , ex: args: [''],
        const request = {
            //targets : --- letting this default to the peers assigned to the channel
            chaincodeId: 'mycc',
            //fcn: 'queryAllCars',
            fcn: reqBody.fcn,
            args: reqBody.args,
        };
        // 	const request = {
        // 	//targets : --- letting this default to the peers assigned to the channel
        // 	chaincodeId: 'myc',
        // 	fcn: 'queryAllCars',
        // 	args: ['']
        // };
        // const request = {
        // 	//targets : --- letting this default to the peers assigned to the channel
        // 	chaincodeId: 'fabcar',
        // 	fcn: 'queryCar',
        // 	args: ['CAR9']
        // };
        // send the query proposal to the peer
        return channel.queryByChaincode(request);
    }).then((query_responses) => {
        console.log("Query has completed, checking results");
        // query_responses could have more than one  results if there multiple peers were used as targets
        if (query_responses && query_responses.length == 1) {
            if (query_responses[0] instanceof Error) {
                console.error("error from query = ", query_responses[0]);
            } else {
                console.log("Response is ", query_responses[0].toString());
            }
        } else {
            console.log("No payloads were returned from query");
        }
        res.send(query_responses[0].toString());
    }).catch((err) => {
        res.send(err);
        console.error('Failed to query successfully :: ' + err);
    });

});

//////////////////////////////////////////////////////
////////  Query chaincode ends ///////////////////////
//////////////////////////////////////////////////////
app.listen(4000, function () {
    console.log("app running on ", port);
})