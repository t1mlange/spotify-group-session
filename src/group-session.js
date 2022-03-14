//@ts-check

// NAME: Group Session
// AUTHOR: Tim Lange (@timll)
// DESCRIPTION: Brings group sessions to the desktop client.

/// <reference path="../globals.d.ts" />

(function GroupSession() {
    if (!Spicetify.CosmosAsync || !Spicetify.LocalStorage) {
        setTimeout(GroupSession, 300);
        return;
    }

    // Interval in which to check if the session is still alive
    const ALIVE_INTERVAL = 5000;

    // Global enable state
    let isEnabled;
    // Option: Show scan code in full screen mode
    let showScanCode;
    // Whether user is about to join a session (by entering link)
    let isJoiningSession;
    // Whether user just triggered a link copy
    let isCopyingLink;
    // Private session id
    let session_id;
    // Whether user is the owner of the group session
    let is_session_owner;
    // Public session token used for others to join
    let join_session_token;
    // Contains the interval id
    let alive_job;
    // Cache of users listening
    let users;
    // Caching profile picture links to save api calls
    let imageCache;


    /*************
     * API Calls *
     *************/
    const createSession = async () => {
        const local_device_id = Spicetify.Player.data.play_origin.device_identifier;
        if (local_device_id == null) {
            Spicetify.showNotification("Local device id is unknown. Try to play music before creating a new session.");
            return;
        }

        // Doesn't fail. If session already exists, the current session is returned.
        try {
            const res_join = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new?local_device_id=${local_device_id}&type=REMOTE`);
            session_id = res_join["session_id"];
            join_session_token = res_join["join_session_token"];
            is_session_owner = res_join["is_session_owner"];
            users = res_join["session_members"];
            alive_job = setInterval(checkAlive, ALIVE_INTERVAL);
            imageCache = {};
        } catch (e) {
            Spicetify.showNotification("Session creation failed. Make sure your connected to the internet and the account has Spotify Premium.");
        }
    }

    const joinSession = async (sessionId) => {
        const local_device_id = Spicetify.Player.data.play_origin.device_identifier;
        if (local_device_id == null) {
            Spicetify.showNotification("Local device id is unknown. Try to play music before creating a new session.");
            return;
        }

        // Doesn't fail. If session already exists, the current session is returned.
        try {
            const res_join = await Spicetify.CosmosAsync.post(`https://spclient.wg.spotify.com/social-connect/v2/sessions/join/${sessionId}/?join_type=deeplinking&local_device_id=${local_device_id}&playback_control=listen_and_control`);
            session_id = res_join["session_id"];
            join_session_token = res_join["join_session_token"];
            is_session_owner = res_join["is_session_owner"];
            users = res_join["session_members"];
            alive_job = setInterval(checkAlive, ALIVE_INTERVAL);
            imageCache = {};
        } catch (e) {
            Spicetify.showNotification("Session joining failed. Make sure your connected to the internet and the account has Spotify Premium.");
        }
    }

    const leaveSession = async () => {
        const local_device_id = Spicetify.Player.data.play_origin.device_identifier;

        if (local_device_id == null) {
            Spicetify.showNotification("Local device id is unknown.");
            return;
        }

        if (session_id != null) {
            // On success, the response is empty.
            // On error, it contains error_type and message.
            const res_leave = await Spicetify.CosmosAsync.post(`https://spclient.wg.spotify.com/social-connect/v3/sessions/${session_id}/leave?local_device_id=${local_device_id}`);

            if ("error_type" in res_leave) {
                Spicetify.showNotification(res_leave.message);
            }
        }
        
        // cleanup
        clearGlobals();
    }

    const deleteSession = async () => {
        const local_device_id = Spicetify.Player.data.play_origin.device_identifier;

        if (local_device_id == null) {
            Spicetify.showNotification("Local device id is unknown.");
            return;
        }

        if (session_id != null) {
            // On success, the response is empty.
            // On error, it contains error_type and message.
            const res_leave = await Spicetify.CosmosAsync.del(`https://spclient.wg.spotify.com/social-connect/v3/sessions/${session_id}?local_device_id=${local_device_id}`);

            if ("error_type" in res_leave) {
                Spicetify.showNotification(res_leave.message);
            }
        }
        
        // cleanup
        clearGlobals();
    }

    const checkAlive = async () => {
        try {
            const res_info = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/social-connect/v2/sessions/info/${join_session_token}`);
            users = res_info["session_members"];
        } catch (ex) {
            Spicetify.showNotification("Session died unexpectedly.");
            clearGlobals();
        }
    }


    /******************
     * Listener Modal *
     ******************/
    const injectListenerStyles = () => {
        const style = document.styleSheets[document.styleSheets.length - 1];
        // Listeners Styles
        style.insertRule(`
            .spicetify-user-list-item {
                display: flex;
                align-items: center;
                padding: 10px;
                border-radius: 5px;
            }`, 
        style.cssRules.length);
        style.insertRule(`
            .spicetify-user-list-item:hover {
                background-color: rgba(255, 255, 255, 0.1);
                text-decoration: none;
            }`, 
        style.cssRules.length);
        style.insertRule(`
            .spicetify-user-list-item-img {
                width: 50px;
                height: 50px;
                border-radius: 50px;
                margin-right: 15px;
            }`, 
        style.cssRules.length);
    }

    const getUserItem = async (user) => {
        if (!(user["username"] in imageCache)) {
            const resp = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/users/${user["username"]}`);
            imageCache[user["username"]] = resp["images"];
        }

        const userLink = document.createElement("a");
        userLink.classList.add("spicetify-user-list-item");
        userLink.href = `https://open.spotify.com/user/${user["username"]}`;
        userLink.draggable = false;
        userLink.addEventListener("click", Spicetify.PopupModal.hide);

        const images = imageCache[user["username"]];
        let img;
        if (images.length === 0) {
            img = document.createElement("span");
            img.style.backgroundColor = "#1ED760";
            if (user["display_name"].length > 0) {
                img.textContent = user["display_name"][0];
                img.style.textAlign = "center";
                img.style.lineHeight = "50px";
            }
        } else {
            img = document.createElement("img");
            img.src = images[0]["url"];
        }
        img.classList.add("spicetify-user-list-item-img");
        userLink.appendChild(img);

        const name = document.createElement("span");
        name.style.fontSize = "18px";
        name.textContent = user["display_name"];
        userLink.appendChild(name);

        return userLink;
    }

    const showUserList = async (e) => {
        if (session_id == null) {
            return;
        }

        const userContainer = document.createElement("div");
        userContainer.style.display = "flex";
        userContainer.style.flexDirection = "column";

        Spicetify.PopupModal.display({
            title: "Listeners",
            content: userContainer,
        });

        for (let i = 0; i < users.length; i++) {
            const user = await getUserItem(users[i])
            userContainer.appendChild(user);
        }
    }


    /***************
     * Device Menu *
     ***************/
    const buildContainerAndTitle = () => {
        const containerDiv = document.createElement("div");
        containerDiv.id = "spicetify-group-session-menu"
        containerDiv.style.display = "flex";
        containerDiv.style.justifyContent = "center";
        containerDiv.style.flexWrap = "wrap";
        containerDiv.style.paddingBottom = "12px";

        const titleDiv = document.createElement("div");
        titleDiv.classList.add("connect-title", "main-type-cello");
        titleDiv.style.color = "#ffffff";

        const title = document.createElement("h3");
        titleDiv.appendChild(title);
        title.classList.add("connect-title__text");
        title.textContent = "Group Session";
        title.style.padding = "0px 0px";
        title.style.marginBottom = "3px";

        const helpLink = document.createElement("a");
        titleDiv.appendChild(helpLink);
        helpLink.draggable = false;
        helpLink.classList.add("connect-title__help");
        helpLink.href = "https://support.spotify.com/us/article/group-session/";
        helpLink.target = "_blank";

        const tooltip = document.createElement("span");
        helpLink.appendChild(tooltip);
        tooltip.classList.add("hidden-visually");
        tooltip.textContent = "What are group sessions?";

        containerDiv.appendChild(titleDiv);

        return containerDiv;
    }

    const timeout = (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const handleCreateButtonPressed = async (e) => {
        e.target.disabled = true;
        await createSession();
        updateMenu();
    }

    const handleJoinButtonPressed = async (e) => {
        e.target.disabled = true;
        isJoiningSession = true;
        await timeout(100);
        updateMenu();
    }

    const buildStartMenu = () => {
        const containerDiv = buildContainerAndTitle();
        
        const buttonDiv = document.createElement("div");
        buttonDiv.style.display = "flex";
        buttonDiv.style.marginTop = "5px";

        const createButton = document.createElement("button");
        createButton.style.flex = "1";
        createButton.style.marginRight = "7px";
        createButton.style.padding = "8px 8px";
        createButton.classList.add("main-buttons-button", "main-button-primary");
        createButton.textContent = "Start Session";
        createButton.addEventListener("click", handleCreateButtonPressed);
        buttonDiv.appendChild(createButton);

        const joinButton = document.createElement("button");
        joinButton.style.flex = "1";
        joinButton.style.padding = "8px 8px";
        joinButton.classList.add("main-buttons-button", "main-button-primary");
        joinButton.textContent = "Join Session";
        joinButton.addEventListener("click", handleJoinButtonPressed);
        buttonDiv.appendChild(joinButton);

        containerDiv.appendChild(buttonDiv);

        return containerDiv;
    }

    const handleLeaveButtonPressed = async (e) => {
        e.target.disabled = true;
        if (is_session_owner) {
            await deleteSession();
        } else {
            await leaveSession();
        }
        updateMenu();
    }

    const handleCopyLink = (e) => {
        if (!isCopyingLink) {
            return;
        }
        // @ts-ignore
        const sessionLink = document.getElementById("spicetify-group-session-menu-link").value;
        e.clipboardData.setData('text/plain', sessionLink);
        e.preventDefault();
        Spicetify.showNotification("Link copied to clipboard");
        isCopyingLink = false;
    }

    const handleCopyLinkPressed = () => {
        isCopyingLink = true;
        document.execCommand('copy');
    }

    const buildSessionMenu = () => {
        const containerDiv = buildContainerAndTitle();
        
        const img_bg_color = "1ED760"; // spotify green
        const img_text_color = "black"; // or white
        const width = "600";
        const join_img = `https://scannables.scdn.co/uri/plain/png/${img_bg_color}/${img_text_color}/${width}/spotify%3Asocialsession%3A${join_session_token}`;

        const imgEl = document.createElement("img");
        imgEl.src = join_img;
        imgEl.style.width = "100%";
        imgEl.style.paddingBottom = "12px";
        containerDiv.appendChild(imgEl);

        const copyLink = document.createElement("input");
        copyLink.id = "spicetify-group-session-menu-link";
        copyLink.type = "text";
        copyLink.readOnly = true;
        copyLink.onclick = handleCopyLinkPressed;
        copyLink.value = `https://open.spotify.com/socialsession/${join_session_token}`;
        copyLink.classList.add("main-playlistEditDetailsModal-textElement", "main-playlistEditDetailsModal-titleInput");
        copyLink.style.marginBottom = "12px";
        copyLink.style.cursor = "pointer";
        containerDiv.appendChild(copyLink);

        const listenerButton = document.createElement("button");
        listenerButton.addEventListener("click", showUserList);
        listenerButton.classList.add("main-buttons-button", "main-button-outlined");
        listenerButton.textContent = "Show Listeners";
        listenerButton.style.marginBottom = "12px";
        containerDiv.appendChild(listenerButton);

        const closeButton = document.createElement("button");
        closeButton.addEventListener("click", handleLeaveButtonPressed);
        closeButton.classList.add("main-buttons-button", "main-button-outlined");
        closeButton.textContent = "Close Session";
        closeButton.style.fontSize = "8px";
        closeButton.style.lineHeight = "8px";
        containerDiv.appendChild(closeButton);

        return containerDiv;
    }

    const extractSessionId = (sessionLink) => {
        const prefix = "open.spotify.com/socialsession/";
        let startIndex = sessionLink.indexOf(prefix);
        if (startIndex === -1) { // Obviously invalid link
            return null;
        }
        startIndex += prefix.length;
        let endIndex = sessionLink.lastIndexOf("?");
        if (endIndex === -1) {
            endIndex = sessionLink.length;
        }
        return sessionLink.substring(startIndex, endIndex);
    }

    const handleConfirmJoinButtonPressed = async (e) => {
        e.target.disabled = true;

        // Reading link
        const enterLinkField = document.getElementById("spicetify-group-session-join-link");
        
        // @ts-ignore
        const sessionId = extractSessionId(enterLinkField.value);
        if (sessionId !== null) {
            await joinSession(sessionId);
            isJoiningSession = false;
        } else {
            Spicetify.showNotification("Could not join session. Maybe the session link is invalid?");
            await timeout(100);
        }
        updateMenu();
    }

    const handleCancelJoinButtonPressed = async (e) => {
        e.target.disabled = true;
        isJoiningSession = false;
        await timeout(100);
        updateMenu();
    }

    const buildJoinMenu = () => {
        const containerDiv = buildContainerAndTitle();

        const enterLink = document.createElement("input");
        enterLink.id = "spicetify-group-session-join-link";
        enterLink.type = "text";
        enterLink.onkeyup = (e) => {
            if (e.key === "Enter") {
                document.getElementById("confirm-join-button").click();
            }
        };
        enterLink.placeholder = `https://open.spotify.com/socialsession/`;
        enterLink.classList.add("main-playlistEditDetailsModal-textElement", "main-playlistEditDetailsModal-titleInput");
        enterLink.style.marginBottom = "12px";
        setTimeout(() => enterLink.focus(), 100);
        containerDiv.appendChild(enterLink);

        const confirmJoinButton = document.createElement("button");
        confirmJoinButton.id = "confirm-join-button";
        confirmJoinButton.addEventListener("click", handleConfirmJoinButtonPressed);
        confirmJoinButton.classList.add("main-buttons-button", "main-button-outlined");
        confirmJoinButton.textContent = "Join";
        confirmJoinButton.style.marginBottom = "12px";
        confirmJoinButton.style.marginRight = "5px";
        containerDiv.appendChild(confirmJoinButton);

        const cancelButton = document.createElement("button");
        cancelButton.addEventListener("click", handleCancelJoinButtonPressed);
        cancelButton.classList.add("main-buttons-button", "main-button-outlined");
        cancelButton.textContent = "Cancel";
        cancelButton.style.marginBottom = "12px";
        containerDiv.appendChild(cancelButton);
        
        return containerDiv;
    };

    const updateMenu = () => {
        // remove the old menu if exists
        const oldMenu = document.getElementById("spicetify-group-session-menu");
        if (oldMenu != null) {
            oldMenu.remove();
        }

        const deviceMenu = document.querySelector(".connect-device-list-content");
        if (!isEnabled || deviceMenu == null) {
            return;
        }

        // get the new menu
        let containerDiv;
        if (session_id != null && join_session_token != null && is_session_owner != null) {
            containerDiv = buildSessionMenu();
        } else if (isJoiningSession) {
            containerDiv = buildJoinMenu();
        } else {
            session_id = null;
            is_session_owner = null;
            join_session_token = null;
            containerDiv = buildStartMenu();
        }
        deviceMenu.appendChild(containerDiv);
    }


    /**************
     * Fullscreen *
     **************/
    const tryInsertFullScreen = () => {
        if (join_session_token == null) {
            return;
        }
        const main = document.querySelector(".npv-main-container");
        if (main == null) {
            return;
        }
        if (document.getElementById("spicetify-scancode-fullscreen") != null) {
            return;
        }
        const img_bg_color = "1ED760"; // spotify green
        const img_text_color = "black"; // or white
        const width = "600";
        const join_img = `https://scannables.scdn.co/uri/plain/png/${img_bg_color}/${img_text_color}/${width}/spotify%3Asocialsession%3A${join_session_token}`;
        
        const imgEl = document.createElement("img");
        imgEl.id = "spicetify-scancode-fullscreen";
        imgEl.src = join_img;
        imgEl.style.opacity = "0.5";
        imgEl.style.position = "absolute";
        imgEl.style.bottom = "36em";
        imgEl.style.right = "14em";
        imgEl.style.width = "62em";

        main.appendChild(imgEl);
    }

    const onFullscreen = (e) => {
        setTimeout(tryInsertFullScreen, 100);
    }



    /***********
     * General *
     ***********/
    const insertObserver = (e) => {
        if (!isEnabled) {
            return;
        }

        const target = e.target;
        // Make sure we accutally have an element
        if (target == null || !("classList" in target)) {
            return;
        }

        // Update menu on display of the device menu, and when devices appear & disappear
        // @ts-ignore
        if (target.classList.contains("connect-device-list-container--is-visible") || 
            target.classList.contains("connect-device-list") ||
            ("previousSibling" in target && target.previousSibling !== null && 
             target.previousSibling.id === "spicetify-group-session-menu")
        ) {
            updateMenu();
            return;
        }
    }

    const clearGlobals = () => {
        session_id = null;
        is_session_owner = null;
        join_session_token = null;
        imageCache = null;
        users = null;
        clearInterval(alive_job);
    }

    const initialize = () => {
        injectListenerStyles();
        document.addEventListener("DOMNodeInserted", insertObserver);
        document.addEventListener("copy", handleCopyLink);
        const fs_btn = document.querySelector(".main-nowPlayingBar-right > .ExtraControls > button.control-button");
        fs_btn.addEventListener("click", onFullscreen);
    }

    const terminate = () => {
        document.removeEventListener("DOMNodeInserted", insertObserver);
        document.removeEventListener("copy", handleCopyLink);
        const fs_btn = document.querySelector(".main-nowPlayingBar-right > .ExtraControls > button.control-button");
        fs_btn.addEventListener("click", onFullscreen);
        clearGlobals();
        updateMenu();
    }

    isEnabled = Spicetify.LocalStorage.get("group-session-enabled") === "true" || Spicetify.LocalStorage.get("group-session-enabled") === null;
    showScanCode = Spicetify.LocalStorage.get("group-session-showscancode") === "true";
    isJoiningSession = false;
    isCopyingLink = false;

    if (isEnabled) {
        initialize();
    }

    const enableMenuItem = new Spicetify.Menu.Item(
        "Enable Group Session",
        isEnabled,
        (item) => {
            isEnabled = !isEnabled;
            item.setState(isEnabled);
            Spicetify.LocalStorage.set("group-session-enabled", isEnabled ? "true" : "false");

            if (isEnabled) {
                initialize();
            } else {
                terminate();
            }
        }
    );
    const showInFSItem = new Spicetify.Menu.Item(
        "Show Spotify Code in Fullscreen Mode",
        showScanCode,
        (item) => {
            showScanCode = !showScanCode;
            item.setState(showScanCode);
            Spicetify.LocalStorage.set("group-session-showscancode", showScanCode ? "true" : "false");
        }
    );
    const menu = new Spicetify.Menu.SubMenu("Group Session", [enableMenuItem, showInFSItem]);
    menu.register();
})();
