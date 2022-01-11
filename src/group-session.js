//@ts-check

// NAME: Group Session
// AUTHOR: Tim Lange (@timll)
// DESCRIPTION: Brings group sessions to the desktop client.

/// <reference path="../globals.d.ts" />

(function GroupSession() {
    let isEnabled = true;
    let session_id;
    let join_session_token;

    let createSession = async () => {
        const local_device_id = Spicetify.Player.data.play_origin.device_identifier;
        if (local_device_id == null) {
            Spicetify.showNotification("Local device id is unknown. Try to play music before creating a new session.");
            return;
        }

        const res_join = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/social-connect/v2/sessions/current_or_new?local_device_id=${local_device_id}&type=REMOTE`);

        session_id = res_join.session_id;
        join_session_token = res_join.join_session_token;
    }

    let deleteSession = async () => {
        const local_device_id = Spicetify.Player.data.play_origin.device_identifier;

        if (local_device_id == null) {
            Spicetify.showNotification("Local device id is unknown.");
            return;
        }

        if (session_id == null) {
            Spicetify.showNotification("No group session to leave!")
            return;
        }
        
        const res_leave = await Spicetify.CosmosAsync.del(`https://spclient.wg.spotify.com/social-connect/v3/sessions/${session_id}?local_device_id=${local_device_id}`)

        // cleanup
        session_id = null;
        join_session_token = null;
    }

    let buildContainerAndTitle = () => {
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

    let buttonStart = async (e) => {
        e.target.style.display = "hidden";
        await createSession();
        injectMenu();
    }

    let buildStartMenu = () => {
        const containerDiv = buildContainerAndTitle();

        const createButton = document.createElement("button");
        createButton.classList.add("main-buttons-button", "main-button-primary");
        createButton.textContent = "Start Session";
        createButton.addEventListener("click", buttonStart);
        containerDiv.appendChild(createButton);

        return containerDiv;
    }

    let buttonLeave = async (e) => {
        e.target.style.display = "none";
        await deleteSession();
        injectMenu();
    }

    let buildSessionMenu = () => {
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


        const closeButton = document.createElement("button");
        closeButton.addEventListener("click", buttonLeave);
        closeButton.classList.add("main-buttons-button", "main-button-outlined");
        closeButton.textContent = "Close Session";
        containerDiv.appendChild(closeButton);

        return containerDiv;
    }

    let injectMenu = () => {
        // remove the old menu if exists
        const old_menu = document.getElementById("spicetify-group-session-menu");
        if (old_menu != null) {
            old_menu.remove();
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
        // add it to the device menu if possible
        const deviceMenu = document.querySelector(".connect-device-list-content");
        if (deviceMenu != null) {
            deviceMenu.appendChild(containerDiv);
        } else {
            console.warn("Injecting group session menu failed!");
        }
    }
    

    document.addEventListener("DOMNodeInserted", (e) => {
        if (!isEnabled) {
            return;
        }

        const target = e.target;
        // Make sure we accutally have an element
        if (target == null || !("classList" in target)) {
            return;
        }

        // Exit if the added element is not the devices menu
        // @ts-ignore
        if (!target.classList.contains("connect-device-list-container--is-visible")) {
            return;
        }

        injectMenu();
    });


    new Spicetify.Menu.Item(
        "Enable Group Session",
        isEnabled,
        (item) => {
            isEnabled = !isEnabled;
            item.setState(isEnabled);
        }
    ).register();
})();