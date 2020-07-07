const fetch = require("node-fetch");
const RichFlyer = require('richflyer');

// Get from RichFlyer management page
const customerId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const serviceId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const apiKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const sdkKey = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Message template Id that has created at RichFlyer management page.
const templateId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Media url. You can use local media file path.
const movieUrl = "https://richflyer.net/movie.mp4";
const imageUrl = "https://richflyer.net/image.jpg";

const postMessage = async () => {
    const rf = new RichFlyer(
        customerId,
        serviceId,
        sdkKey,
        apiKey
    );

    // Upload and Register Media.
    rf.registerMedia(movieUrl, imageUrl)
      .then (async mediaId => {
        
        console.log(mediaId);
        
        // registerMessage
        let draft = false;
        let skipApproval = false;


        let title = "";
        let message = "";

        // If you will input empty value to title or message, sdk use template title or message.
        await rf.registerPosting(draft, skipApproval, templateId, title, message, mediaId)
            .then( url => {
                // Get editor url. 
                // If you will set draft flag true,, you can open browser with this url and edit message.
                console.log(url);
            }, error => console.log(error.message));

      }, error => console.log(error.message));
}

postMessage();