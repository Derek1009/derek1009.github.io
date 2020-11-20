'use strict';

let webrtc = null;
let joined = false;
let rooms = new Map();
let $index = $('#index');
let $appid = $('#appid');
let $roomid = $('#roomid');
let $uid = $('#uid');
let $token = $('#token');
let $form = $("form");

let $join = $('#join');
let $leave = $('#leave');
let $tips = $('#tip');
let $SRoomId = $('#SRoomId');
let $SUid = $('#SUid')

$form.submit(async function (e) {
    e.preventDefault();
    await join();
});
$index.change(() => {
    $SUid.val('');
    $SRoomId.val('');
});
$leave.click(() => {
    leave();
});
async function join () {
    try {
        if (joined) {
            return;
        }
        let appId = parseInt($appid.val());
        let roomid = $roomid.val();
        let uid = $uid.val();
        let token = $token.val();

        if (isNaN(appId)) {
            warn('AppId must be number');
            return;
        }

        webrtc = new WebRTC();
        let err = webrtc.init(appId);

        if (err === null) {
            console.log('init success');
        } else {
            warn(err.error);
            return;
        }
        
        // register event callback
        webrtc.on('remote_stream_add', async (ev, remoteStream) => {
            // subscribe remote stream
            await webrtc.subscribe(remoteStream);

            // create div for remote stream
            
            let divId = createUserDiv($index.val(), remoteStream);

            // play remote stream
            await webrtc.play(remoteStream.uid, divId);
        });

        webrtc.on('remote_stream_remove', async (ev, remoteStream) => {
            removeUserDiv($index.val());
        });

        if (!token) {
            token = undefined;
        }
        // join room
        await webrtc.joinRoom({
            uid: uid,
            roomId: roomid,
            token: token,
        });
        
        joined = true;
        $join.prop('disabled', true);
        $leave.prop('disabled', false);

    } catch (e) {
        if (e && e.error) {
            console.warn(e.error);
        } else {
            console.warn(e);
        }
        if (webrtc) {
            webrtc.leaveRoom();
            joined = false;
        }
    }
}

function validator (params) {
    let _return = true
    for (let room of rooms) {
        if (room[1].index === params.index && room[1].webrtc) {
            $tips.html('当前位置已有视图，请选择其他的视图')
            _return = false
            return false
        }
        if (room[1].appId === params.appId && room[1].webrtc) {
            if (params.roomid === room[1].roomid) {
                if (params.uid === room[1].uid) {
                    $tips.html('该uid 用户已登录')
                    _return = false
                    return false
                }
            }
        }
    }
    return _return
}

function leave () {
    if (!joined) {
        return;
    }
    webrtc.leaveRoom();
    joined = false;
    $join.prop('disabled', false);
    $leave.prop('disabled', true);
}

function getMediaStat (flagId, index) {
    if (!webrtc) {
        return;
    }
    let _room = rooms.get(flagId)
    let userStat = {};
    var downlinkAudioStats = webrtc.getDownlinkAudioStats();
    var downlinkVideoStats = webrtc.getDownlinkVideoStats();
    var hasAudio = webrtc.hasAudio(_room.suid);
    
    let rets = [downlinkAudioStats ,downlinkVideoStats];
    let ownerid = _room.suid
    for (let ret of rets) {
        if (ret.result) {
            for (let [uid, t] of ret.result.entries()) {
                userStat[uid] = Object.assign({}, userStat[uid], t, { hasAudio });
            }
        }
    }
    
    if (userStat && userStat[ownerid]) {
        for (var room of rooms) {
            if (room[1].suid === ownerid) {
                removeMediaStatDiv(index);
                createMediaStatDiv(index, userStat[ownerid]);
            }
        }
    }
}

function createMediaStatDiv (index, stat) {
    let div = $(`#view-${index}`);
    let network = `<img src="../static/img/network_${stat.networkScore}.png" />`
    let voice = `<img src="../static/img/voice-${parseInt(stat.audioLevel / 20)}.png" />`
    let muteVoice = stat.hasAudio
        ? '<img src="../static/img/voice-5.png" />'
        : '<img src="../static/img/voice-enable.png" />'
    div.append(`<div id="state" class="label label-info" style="position: absolute; right: 0;
    top: 0; z-index: 1;min-width:120px;">
        <div>网络质量: ${stat && stat.networkScore || 0} ${network}</div>
        <div>音频音量: ${stat.audioLevel} ${voice}</div>
        <div>视频码率: ${stat.videoBitRate}</div>
        <div>音频码率: ${stat.audioBitRate}</div>
        <div>Mute状态: ${!stat.hasAudio} ${muteVoice}</div>
    </div>`);
}

function removeMediaStatDiv (index) {
    let div = $(`#view-${index}`);
    div.find('#state').remove();
}

function onNetworkScore (ev, data) {
    updateNetworkScore(data.uplinkNetworkScore, data.downlinkNetworkScore);
}

function updateNetworkScore (upScore, downScore) {
    console.log(upScore, downScore)
}

function createUserDiv (index, params) {
    let div = $(`#view-${index}`);
    div.append(`<div class="label label-info" style="position: absolute; left: 0;
    top: 0; z-index: 1;">
        <div>${index}</div>
        <div>RoomId: ${params.roomId}</div>
    </div>`);
    let innerDiv = $("<div style='height: 100%; width: 100%;'></div>");
    div.append(innerDiv);
    let mediaId = 'media-' + index;
    let mediaDiv = $("<div class='media'></div>").attr('id', mediaId);
    innerDiv.append(mediaDiv);
    let statDiv = $(`<div id='stat-${params.uid}' class='label label-info' style='position: absolute; left: 0; bottom: 0; z-index: 1;'>主播uid：${params.uid}</div>`);
    innerDiv.append(statDiv);
    return mediaId;
}

function removeUserDiv (index) {
    $(`#view-${index}`).children().remove();
}

// 输出下行音量
function getDownVolumeScore (room) {
    var downlinkAudioStats = room.webrtc.getDownlinkAudioStats();
    let rets = downlinkAudioStats
    if (rets && rets.result && rets.result.get(room.ownerUid)) {
        return Number(rets.result.get(room.ownerUid).audioLevel)
    }
    return 0
}

$('#addSubscribe').click(() => {
    addSubscribe();
});
function addSubscribe () {
    let index = parseInt($index.val());
    let sroom = $SRoomId.val();
    let suid = $SUid.val();

    let flag = `${index}:${sroom}:${suid}`;
    let params = {
        index,
        sroom,
        suid,
        timer: null
    };
    if (rooms.get(flag)) {
        return console.warn('You alerady addSubscribe');
    }
    if (webrtc) {
        let err = webrtc.addSubscribe(sroom, suid);
        if (err) {
            console.warn(err.error);
        }
        rooms.set(flag, params);
        params.timer = setInterval(() => {
            getMediaStat(flag, index)
        }, 1000)
        
    } else {
        console.warn('create WebRTC first');
    }
}

$('#removeSubscribe').click(() => {
    removeSubscribe();
});
function removeSubscribe () {
    let index = parseInt($index.val());
    let sroom = $SRoomId.val();
    let suid = $SUid.val();

    let flag = `${index}:${sroom}:${suid}`;
    if (rooms.get(flag)) {
        if (webrtc) {
            let err = webrtc.removeSubscribe(sroom, suid);
            clearInterval(rooms.get(flag).timer);
            rooms.delete(flag);
            if (err) {
                console.warn(err.error);
            }
        } else {
            console.warn('create WebRTC first');
        }
    } else {
        console.warn('You are not subscribe some stream');
    }
}