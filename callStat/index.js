'use strict';

let webrtc = null;
let joined = false;
let pushed = false;
let pulled = false;

let $invite = $("#invite");

let $appid = $("#appid");
let $roomId = $("#roomId");
let $uid = $("#uid");
let $token = $("#token");
let $leave = $("#leave");
let $join = $("#join");
let $users = $("#users");
let $message = $("#message");
let $form = $("form");

let $publish = $("#publish");
let $pull = $("#pull");

let ulocalUid = "";
let remoteUid = {};

const url = new URL(window.location);
let uAppid = url.searchParams.get('appid');
let uRoomId = url.searchParams.get('roomId');
let uToken = url.searchParams.get('token');
$appid.val(uAppid);
$roomId.val(uRoomId);
$token.val(uToken);
$invite.hide();
$uid.val(getRandomUid());

if (uAppid && uRoomId) {
    join();
}

$form.submit(async function (e) {
    e.preventDefault();
    await join();
});

async function join() {
    try {
        if (joined) {
            return;
        }
        let appId = parseInt($appid.val());
        if (isNaN(appId)) {
            warn('AppId must be number');
            return;
        }
        webrtc = new WebRTC(); // create WebRTC object

        let err = webrtc.init(appId); // init
        if (err === null) {
            console.log('init success');
        } else {
            warn(err.error);
            return;
        }

        let roomId = $roomId.val();

        // register event callback
        webrtc.on('remote_stream_add', async (ev, remoteStream) => {

            let strUid = 'remote-user-' + remoteStream.uid;
            if( pulled ){
                // subscribe remote stream
                await webrtc.subscribe(remoteStream);

                // create div for remote stream
                let divId = createUserDiv(strUid, remoteStream.uid);

                // play remote stream
                await webrtc.play(remoteStream.uid, divId);
            }

            if( remoteUid[strUid] ){
                console.log('异常:远程用户队列存储异常!');
            }else{
                remoteUid[strUid] = remoteStream;
            }

        });

        webrtc.on('remote_stream_remove', async (ev, remoteStream) => {
            let strUid = 'remote-user-' + remoteStream.uid;
            if(remoteUid[strUid]){
                removeUserDiv(strUid);
                delete remoteUid[strUid];
            }
        });

        webrtc.on('network_score', onNetworkScore);

        $join.prop('disabled', true);

        let uid = $uid.val();
        let token = $token.val();
        if (token.length === 0) {
            token = undefined;
        }

        // join room
        await webrtc.joinRoom({
            uid: uid,
            roomId: roomId,
            token: token,
        });
        joined = true;
        $leave.attr('disabled', false);

        // 更新按钮状态为: 激活
     //   $publish.attr('class', 'btn btn-success');
        $publish.attr('disabled', false);

     //   $pull.attr('class', 'btn btn-success');
        $pull.attr('disabled', false);

        // // create local stream
        // let localStream = await webrtc.createStream({
        //     audio: true, // enable microphone
        //     video: {
        //         videoMode: 3, // HD VIDEO
        //     }
        // });
        // let divId = createUserDiv('local-user-' + localStream.uid, localStream.uid);
        // await webrtc.play(localStream.uid, divId); // play local stream
        // await webrtc.publish(); // publish local stream
        $invite.attr('href', `index.html?appid=${appId}&roomId=${roomId}`);
        $invite.show();

    } catch (e) {
        if (e && e.error) {
            warn(e.error);
        } else {
            warn(e);
        }
        if (webrtc) {
            webrtc.leaveRoom();
            joined = false;
            $leave.attr('disabled', true);
            $join.prop('disabled', false);

            $publish.attr('disabled', true);
            $pull.attr('disabled', true);
        }
    }
}

function leave() {
    if (!joined) {
        return;
    }
    webrtc.leaveRoom();
    $users.empty();
    $join.prop('disabled', false);
    $leave.prop('disabled', true);
    $invite.hide();
    joined = false;
    updateNetworkScore(0, 0);

    // 推流状态指示清除
    pushed = false;
    $publish.attr('class', 'btn btn-default');
    $publish.prop('disabled', true);
    // 拉流状态指示清除
    pulled = false;
    $pull.attr('class', 'btn btn-default');
    $pull.prop('disabled', true);

}

$leave.click(() => {
    leave();
});

// 推流
async function publish()  {
    if(!joined){
        return;
    }

    if( pushed ){
        // 1、关闭推流
        //let uid = $uid.val();
        await webrtc.unpublish();

        // 清除local画布
        if(ulocalUid != ""){
            removeUserDiv( 'local-user-' + ulocalUid );
        }

        await webrtc.stopPlay(ulocalUid);
        await webrtc.closeStream();
        ulocalUid = "";
        
        // 网络统计复位
        updateNetworkScore(0 , 0);

        // 状态清除
        pushed = false;
        $publish.attr('class', 'btn btn-default');
        return;
    }else{
        // 2、开启推流

        // 状态置位
        pushed = true;
        $publish.attr('class', 'btn btn-success');

        // create local stream
        let localStream = await webrtc.createStream({
            audio: true, // enable microphone
            video: {
                videoMode: 3, // HD VIDEO
            }
        });
        let divId = createUserDiv('local-user-' + localStream.uid, localStream.uid);
        await webrtc.play(localStream.uid, divId); // play local stream
        await webrtc.publish(); // publish local stream

        //  记录local端uid
        ulocalUid = localStream.uid;
    }

}

$publish.click( async () => {
    await publish();
});

// 拉流
async function pull()  {
    if(!joined){
        return;
    }

    if( pulled ){

        for(let strUid in remoteUid){
            //  停止拉流
            //webrtc.stopPlay(remoteUid[strUid].uid);
            webrtc.unsubscribe(remoteUid[strUid]);
            //  移除视图
            removeUserDiv(strUid);
        }
        pulled = false;
        $pull.attr('class', 'btn btn-default');
    }else{

        pulled = true;
        $pull.attr('class', 'btn btn-success');

        for(let strUid in remoteUid){
            // subscribe remote stream
            let remoteStream = remoteUid[strUid];

            await webrtc.subscribe(remoteStream);

            // create div for remote stream
            let divId = createUserDiv(strUid, remoteStream.uid);

            // play remote stream
            await webrtc.play(remoteStream.uid, divId);
        }

    }

}

$pull.click( async () => {
    await pull();
});

// this will be called every two seconds
function onNetworkScore(ev, data) {
    updateNetworkScore(data.uplinkNetworkScore, data.downlinkNetworkScore);
}

function updateNetworkScore(upScore, downScore) {
    updateClassByScore($('#uplink-network-score'), upScore);
    updateClassByScore($('#downlink-network-score'), downScore);

    $('#uplink-network-score td:nth-child(2)').text(upScore);
    $('#downlink-network-score td:nth-child(2)').text(downScore);
}

function updateClassByScore(element, score) {
    if (score === 0) {
        // 0 is unknown
        element.attr('class', 'active');
    } else if (score === 1) {
        // 1 is good network
        element.attr('class', 'success');
    } else if (score < 5) {
        element.attr('class', 'warning');
    } else {
        element.attr('class', 'danger');
    }
}

function createUserDiv(name, uid) {
    let div = $("<div class='user' style='width: 800px; height: 400px'></div>").attr('id', name);
    div.append(`<span class="label label-info">${name}</span>`);
    let innerDiv = $("<div></div>");
    div.append(innerDiv);
    let mediaId = 'media-' + name;
    let mediaDiv = $("<div class='media' style='float: left'></div>").attr('id', mediaId);
    innerDiv.append(mediaDiv);
    let statDiv = $("<div style='float: left; margin-left: 20px'></div>").attr('id', 'stat-' + uid);
    innerDiv.append(statDiv);
    $users.append(div);
    return mediaId;
}

function removeUserDiv(name) {
    $("#" + name).remove();
}

function timeConvert(timestamp,num){//num:0 YYYY-MM-DD  num:1  YYYY-MM-DD hh:mm:ss // timestamp:时间戳 
    timestamp = timestamp+'';
    timestamp = timestamp.length==10?timestamp*1000:timestamp;
    var date = new Date(timestamp);
    var y = date.getFullYear();  
    var m = date.getMonth() + 1;  
    m = m < 10 ? ('0' + m) : m;  
    var d = date.getDate();  
    d = d < 10 ? ('0' + d) : d;  
    var h = date.getHours();
    h = h < 10 ? ('0' + h) : h;
    var minute = date.getMinutes();
    var second = date.getSeconds();
    minute = minute < 10 ? ('0' + minute) : minute;  
    second = second < 10 ? ('0' + second) : second; 
    if(num==0){
        return y + '-' + m + '-' + d;  
    }else{
        return y + '-' + m + '-' + d +' '+ h +':'+ minute +':' + second;  
    }
}

function packageStatDetals(av,link,obj){
    let detals = {"type":"",   //uplink or downlink + audio or video
    "time":"","networkScore":"","rtt":"","CodecDetals":""};
    detals["type"] = detals["type"] + link + av;

    if( av === "video" ){
        detals["videoLostRate"]="";
        detals["videoBitRate"]="";
    }else if( av === "audio" ){
        detals["audioLostRate"]="";
        detals["audioBitRate"]="";
        detals["audioMuteState"]="";
    }

    for (let key in obj) {
        if( av === "video" ){
            switch(key){
                case "time":
                    detals["time"] = timeConvert(obj[key],1);
                    break;
                case "videoFrameRate":
                case "videoResolution":
                    detals["CodecDetals"] += " , ";
                case "videoCodec":
                    detals["CodecDetals"] = detals["CodecDetals"] + obj[key];
                    break;
                default:
                    detals[key] = obj[key];
            }
        }else if( av === "audio"){
            switch(key){
                case "time":
                    detals["time"] = timeConvert(obj[key],1);
                    break;
                case "audioLevel":
                    detals["CodecDetals"] += " , ";
                case "audioCodec":
                    detals["CodecDetals"] = detals["CodecDetals"] + obj[key];
                    break;
                default:
                    detals[key] = obj[key];
            }
        }else{
            console.log("Warning:解析未知类型!");
        } 
        
    }

    return detals;
}

function showMediaStat() {
    if (!webrtc) {
        return;
    }
    let userStat = {};
    var uplinkVideoStats = webrtc.getUplinkVideoStats();
    var uplinkAudioStats = webrtc.getUplinkAudioStats();
    var downlinkAudioStats = webrtc.getDownlinkAudioStats();
    var downlinkVideoStats = webrtc.getDownlinkVideoStats();

    let rets = [uplinkVideoStats, uplinkAudioStats, downlinkAudioStats ,downlinkVideoStats];

    for (let ret of rets) {
        if (ret.result) {
            for (let [uid, t] of ret.result.entries()) {
                userStat[uid] = Object.assign({}, userStat[uid], t);
            }
        }
    }
    for (let uid in userStat) {
        let t = userStat[uid];
        $('#stat-' + uid).empty().append(createTableFromObj(t));
    }

    var localuid = $uid.val();
    var detals = {};
    userStat = {};
    if( uplinkAudioStats.result ){

        for (let [uid, t] of uplinkAudioStats.result.entries()) {
            if( uid == localuid ){
                detals["uplink-audio"] = packageStatDetals("audio","uplink",t);
            }
        }
    }

    if( uplinkVideoStats.result ){

        for (let [uid, t] of uplinkVideoStats.result.entries()) {
            if( uid == localuid ){
                detals["uplink-video"] = packageStatDetals("video","uplink",t);
            }
        }
    }

    if( downlinkAudioStats.result ){

        for (let [uid, t] of downlinkAudioStats.result.entries()) {
            if( uid != localuid ){
                detals["downlink-audio"] = packageStatDetals("audio","downlink",t);
            }
        }
    }

    if( downlinkVideoStats.result ){

        for (let [uid, t] of downlinkVideoStats.result.entries()) {
            if( uid != localuid ){
                detals["downlink-video"] = packageStatDetals("video","downlink",t);
            }
        }
    }
    
    // if( uplinkVideoStats.result ){
    //     detals["uplink-video"] = packageStatDetals("video","uplink",uplinkVideoStats.result.entries()[localuid]);
    // }
    
    // detals["downlink-audio"] = packageStatDetals("audio","downlink",downlinkAudioStats);
    // detals["downlink-video"] = packageStatDetals("video","downlink",downlinkVideoStats);

    return detals;
}

function createTableFromObj(obj) {
    let tbody = document.createElement('table');

    for (let i in obj) {
        let tr = "<tr>";
        tr += "<td>" + i + "</td>" + "<td>" + obj[i] + "</td></tr>";

        tbody.innerHTML += tr;
    }
    return tbody;
}

function createDetalsObj(obj) {

    let results = "";
    for (let i in obj) {

        results += i + ":" + obj[i] + " ; ";

    }
    return results;
}

function numberFormat(_number, _sep) {
    _number = typeof _number != "undefined" && _number > 0 ? _number : "";
    _number = _number.replace(new RegExp("^(\\d{" + (_number.length%3? _number.length%3:0) + "})(\\d{3})", "g"), "$1 $2").replace(/(\d{3})+?/gi, "$1 ").trim();
    if(typeof _sep != "undefined" && _sep != " ") {
        _number = _number.replace(/\s/g, _sep);
    }
    return _number;
}

setInterval(() => {
    if (!webrtc) {
        return;
    }
    let state = webrtc.getSessionStats();
    if (state.result) {
        $('#sendBitRate td:nth-child(2)').text(numberFormat(String(state.result.sendBitRate),","));
        $('#sendBytes td:nth-child(2)').text(numberFormat(String(state.result.sendBytes),","));
        $('#recvBitRate td:nth-child(2)').text(numberFormat(String(state.result.recvBitRate),","));
        $('#recvBytes td:nth-child(2)').text(numberFormat(String(state.result.recvBytes),","));
    }
    let avDetails = showMediaStat();

    if( avDetails ){

    }

    let dataArray = ["uplink-video","uplink-audio","downlink-video","downlink-audio"];
    
    for( let strlabel of dataArray ){

        var inner = document.getElementById(strlabel);
        for( let idx = inner.children.length - 1; idx >= 1;idx--){
            inner.removeChild(inner.children.item(idx));
        }   
        var map_detals = avDetails[strlabel];
        for(let key in map_detals){
            
            let tr = document.createElement('tr');
            let td = document.createElement('td');
            td.innerText = key;
            td.style.width = "250px";
            tr.appendChild(td);
            td = document.createElement('td');
            td.innerText = map_detals[key];
            td.style.width = "250px";
            tr.appendChild(td);
            inner.append(tr);
        }

    }

}, 1000);

function warn(s) {
    $message.append(`<div class="alert alert-danger alert-dismissible" role="alert">
<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>${s}</div>`)
}

function info(s) {
    $message.append(`<div class="alert alert-success alert-dismissible" role="alert">
<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>${s}</div>`)
}

function getRandomUid() {
    return Math.random().toString(36).slice(-8);
}
