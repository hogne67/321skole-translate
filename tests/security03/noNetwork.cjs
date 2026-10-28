// Test-only preload. Reject every network socket and DNS request; no cloud calls.
/* global require, process */
const net=require('node:net'),dns=require('node:dns'),{syncBuiltinESMExports}=require('node:module'),fs=require('node:fs');
function block(kind){if(process.env.S03_NETWORK_LOG)fs.appendFileSync(process.env.S03_NETWORK_LOG,JSON.stringify({event:'blocked-network',kind})+'\n');throw Error('S03_NETWORK_FORBIDDEN');}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...input){
 const args=Array.isArray(input[0])?input[0]:input,options=args[0];
 const pipe=typeof options==='string'?options:options?.path;
 // tsx's local named pipe is IPC, not a network connection.
 if(typeof pipe==='string'&&process.env.TEMP&&pipe.toLowerCase().startsWith(('\\\\?\\pipe\\'+process.env.TEMP+'\\tsx-').toLowerCase())&&pipe.endsWith('.pipe'))return connect.apply(this,input);
 return block('socket');
};
dns.lookup=function(){return block('dns');};
syncBuiltinESMExports();
