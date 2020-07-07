# RichFlyer SDK

## Overview
This SDK can easily use RichFlyer API.<br>
[RichFlyer](https://richflyer.net) is messaging service that can send message to push notification, twitter, facebook simultaneously and can attach the rich contents like movie, gif, image.

## Installation
``` sh
npm install richflyer
```

## Prerequisites
* User should have RichFlyer Account. If you don't have an account, 
Please contact us from [here](https://richflyer.net).

## Usage
``` js
const RichFlyer = require('richflyer');

const rf = new RichFlyer(
    'aaaaa', // Customer Id
    'bbbbb', // Service Id
    'ccccc', // SDK Key
    'ddddd'  // API Key
);

// Upload and Register Media.
rf.registerMedia(
    "https://richflyer.net/movie.mp4", // movieUrl
    "https://richflyer.net/image.jpg") // imageUrl
    .then (async mediaId => {

    // If you will input empty value to title or message, sdk use template title or message.
    await rf.registerPosting(
        true,     // is draft
        false,    // skip approval
        'abcdef', // templateId
        'Goal!',  // title
        'Our team got a goal! Play the movie now!',// message
        mediaId)
        .then( url => {
            // Get editor url. 
            // If you will set draft flag true,, you can open browser with this url and edit message.
            console.log(url);
        }, error => console.log(error.message));

    }, error => console.log(error.message));
}
```

## License
[Please read our license.](https://richflyer.net/rules_sdk.html)


