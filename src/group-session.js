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
    // Private session id
    let session_id;
    // public session token used for others to join
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
            users = res_join["session_members"];
            alive_job = setInterval(checkAlive, ALIVE_INTERVAL);
            imageCache = {};
        } catch (e) {
            Spicetify.showNotification("Session creation failed. Make sure your connected to the internet and the account has Spotify Premium.");
        }
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

    const buttonStart = async (e) => {
        e.target.disabled = true;
        await createSession();
        updateMenu();
    }

    const buildStartMenu = () => {
        const containerDiv = buildContainerAndTitle();
        
        const createButton = document.createElement("button");
        createButton.classList.add("main-buttons-button", "main-button-primary");
        createButton.textContent = "Start Session";
        createButton.addEventListener("click", buttonStart);
        containerDiv.appendChild(createButton);

        return containerDiv;
    }

    const buttonLeave = async (e) => {
        e.target.disabled = true;
        await deleteSession();
        updateMenu();
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
        copyLink.value = `https://open.spotify.com/socialsession/${join_session_token}`;
        copyLink.classList.add("main-playlistEditDetailsModal-textElement", "main-playlistEditDetailsModal-titleInput");
        copyLink.style.marginBottom = "12px";
        containerDiv.appendChild(copyLink);

        const listenerButton = document.createElement("button");
        listenerButton.addEventListener("click", showUserList);
        listenerButton.classList.add("main-buttons-button", "main-button-outlined");
        listenerButton.textContent = "Show Listeners";
        listenerButton.style.marginBottom = "12px";
        containerDiv.appendChild(listenerButton);

        const closeButton = document.createElement("button");
        closeButton.addEventListener("click", buttonLeave);
        closeButton.classList.add("main-buttons-button", "main-button-outlined");
        closeButton.textContent = "Close Session";
        closeButton.style.fontSize = "8px";
        closeButton.style.lineHeight = "8px";
        containerDiv.appendChild(closeButton);

        return containerDiv;
    }

    const updateMenu = () => {
        // remove the old menu if exists
        const old_menu = document.getElementById("spicetify-group-session-menu");
        if (old_menu != null) {
            old_menu.remove();
        }

        const deviceMenu = document.querySelector(".connect-device-list-content");
        if (!isEnabled || deviceMenu == null) {
            return;
        }

        // get the new menu
        let containerDiv;
        if (session_id != null && join_session_token != null) {
            containerDiv = buildSessionMenu();
        } else {
            session_id = null;
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
        if (target == null) {
            return;
        }

        // Update menu on display of the device menu
        // @ts-ignore
        if ("classList" in target && target.classList.contains("connect-device-list-container--is-visible")) {
            updateMenu();
            return;
        }
    }

    const clearGlobals = () => {
        session_id = null;
        join_session_token = null;
        imageCache = null;
        users = null;
        clearInterval(alive_job);
    }

    const initialize = () => {
        injectListenerStyles();
        document.addEventListener("DOMNodeInserted", insertObserver);
        const fs_btn = document.querySelector(".main-nowPlayingBar-right > .ExtraControls > button.control-button");
        fs_btn.addEventListener("click", onFullscreen);
    }

    const terminate = () => {
        document.removeEventListener("DOMNodeInserted", insertObserver);
        const fs_btn = document.querySelector(".main-nowPlayingBar-right > .ExtraControls > button.control-button");
        fs_btn.addEventListener("click", onFullscreen);
        clearGlobals();
        updateMenu();
    }

    isEnabled = Spicetify.LocalStorage.get("group-session-enabled") === "true" || Spicetify.LocalStorage.get("group-session-enabled") === null;
    showScanCode = Spicetify.LocalStorage.get("group-session-showscancode") === "true";

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
