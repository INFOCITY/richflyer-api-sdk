const fetch = require("node-fetch");
const FormData = require('form-data');
const fs = require("fs");

// トークン
let authenticationToken;

function getServerUrl() {
    if (process.env.RF_SERVER_URL.length > 0) {
        return process.env.RF_SERVER_URL;
    } else {
        return "https://api.richflyer.net";
    }
}

module.exports = class RichFlyerBase {
    constructor(customerId, serviceId, sdkKey, apiKey) {
        this.customerId = customerId;
        this.serviceId = serviceId;
        this.sdkKey = sdkKey;
        this.apiKey = apiKey;
    }

    async checkParameter() {
        const paramErrorCode = 999;
        if (!this.customerId) {
            throw new Error(`A customerId is required.(${paramErrorCode})`);
        }
        if (!this.serviceId) {
            throw new Error(`A serviceId is required.(${paramErrorCode})`);
        }
        if (!this.apiKey) {
            throw new Error(`An apiKey is required.(${paramErrorCode})`);
          }
        if (!this.sdkKey) {
            throw new Error(`A sdkKey is required.(${paramErrorCode})`);
        }
    }


    async getAuthenticationToken() {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";


        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/authentication-tokens`;

        const fetchOptions = {
            method: "POST",
            mode: "cors",
            headers: {
              "X-API-Version": apiVersion,
              "X-Service-Key": sdkKey,
            }
        };

        const response =  await fetch(path, fetchOptions);
        if (!response.ok) {
            throw new Error(`Get token failed.(${response.status})`);
        }

        const json = await response.json();
        return json.id_token;
    }

    async getTemplateData(templateId) {
        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/template/${templateId}`;

        const fetchOptions = {
            method: "GET",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                "Content-Type": "application/json;charset=UTF-8",
                Authorization: "Bearer " + authenticationToken,
            },
        };
        
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            throw new Error(`Get template data failed.(${response.status})`);
        }
        
        let template;
        try {
            template = await response.json();
        } catch (error) {
        }
        return template;
    }

    async createPostingData(templateId, title, message, multiMediaId) {
        let template = await this.getTemplateData(templateId).catch (error => {
            throw error;
        })

        template.title = title || template.title;
        template.body = message || template.body;
        template.multimedia = multiMediaId;
        return template;
    }

    async registerPosting(isDraft, isSkipApproval, templateId, title, message, multiMediaId) {

        await this.checkParameter().catch( error => {
            throw error;
        });

        if (title.length > 30) {
            throw new Error('The title should be 30 characters or less.');
        }

        if (message.length > 320) {
            throw new Error('The title should be 320 characters or less.');
        }

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";
        let editUrl;

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿メッセージ作成
        let postindData = await this.createPostingData(templateId, title, message, multiMediaId).catch (error => {
            throw error;
        })

        const convertIsDraft = Number(isDraft);
        const convertIsSkipApproval = Number(isSkipApproval);

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/postings`;
        path += `?is_draft=${convertIsDraft}&is_skip_approved=${convertIsSkipApproval}`;

        const fetchOptions = {
            method: "POST",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                "Content-Type": "application/json;charset=UTF-8",
                Authorization: "Bearer " + authenticationToken,
            },
            body: JSON.stringify(postindData),
        };

        try {
            const response = await fetch(path, fetchOptions).catch((error) => {
                throw error;
            });

            if (!response.ok) {
                throw new Error(`Register message has failed.(${response.status})`);
            }    
            
            if (response.status == 201) {
                const json = await response.json();
                if(!json){
                    return editUrl;
                }
                editUrl = json.url;
            }
        } catch (error) {
            editUrl = "";
        }

        return editUrl;
    }

    async registerMedia(movieFilePath, imageFilePath) {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        if (movieFilePath && !imageFilePath) {
            throw new Error("A imageFile is required, if you will register movie.");
        }

        var movieFileRS;
        var movieFileUrl;
        if (movieFilePath) {
            if (movieFilePath.indexOf("http://") == 0 ||
                movieFilePath.indexOf("https://") == 0) {
                movieFileUrl = movieFilePath;
            } else {
                movieFileRS = fs.createReadStream(movieFilePath);
            }
        }
        var imageFileRS;
        var imageFileUrl;
        if (imageFilePath) {
            if (imageFilePath.indexOf("http://") == 0 ||
                imageFilePath.indexOf("https://") == 0) {
                imageFileUrl = imageFilePath;
            } else {
                imageFileRS = fs.createReadStream(imageFilePath);
            }
        }

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        ///v1/customers/{customer_id}/services/{service_id}/{outsideapi_key}/media
        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/media`;

        const formData = new FormData();
        if (movieFileRS) {
            formData.append("movie", movieFileRS);
        } else if (movieFileUrl) {
            formData.append("movieUrl", movieFileUrl);
        }

        if (imageFileRS) {
            formData.append("image", imageFileRS);
        } else if (imageFileUrl) {
            formData.append("imageUrl", imageFileUrl);
        }

        const fetchOptions = {
            method: "POST",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                Authorization: "Bearer " + authenticationToken,
            },
            body: formData,
        };
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            throw new Error(`Register media failed.(${response.status})`);
        }

        const json = await response.json();
        return json.media_id;
    }

    async getSegments() {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/segments/control/list`;



        const fetchOptions = {
            method: "GET",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                Authorization: "Bearer " + authenticationToken,
            },
        };
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            throw new Error(`Get segments failed.(${response.status})`);
        }

        const json = await response.json();
        if (!json) return null;

        return json.segmentControl;
    }
    
    async updateSegmentDescription(id, description) {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/segments/control/description`;
        let data = {id: id, description: description};

        const fetchOptions = {
            method: "POST",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                "Content-Type": "application/json;charset=UTF-8",
                Authorization: "Bearer " + authenticationToken,
            },
            body: JSON.stringify(data),
        };
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            let body = response.json;
            throw new Error(`Update description of segment failed.(${response.status})`);
        }
    }

    async updateSegmentStatus(id, isDisable) {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/segments/control/disabled`;
        let data = {id: id, disabled: isDisable ? "1" : "0"};

        const fetchOptions = {
            method: "POST",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                "Content-Type": "application/json;charset=UTF-8",
                Authorization: "Bearer " + authenticationToken,
            },
            body: JSON.stringify(data),
        };
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            let body = response.json;
            throw new Error(`Update status of segment failed.(${response.status})`);
        }
    }

    async createSegment(name) {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/segment/${name}/create`;

        const fetchOptions = {
            method: "POST",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                "Content-Type": "application/json;charset=UTF-8",
                Authorization: "Bearer " + authenticationToken,
            },
        };
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            let body = response.json;
            throw new Error(`create segment failed.(${response.status})`);
        }
    }

    async deleteSegment(name) {

        await this.checkParameter().catch( error => {
            throw error;
        });

        const customerId = this.customerId;
        const serviceId = this.serviceId;
        const apiKey = this.apiKey;
        const sdkKey = this.sdkKey;
        const apiVersion = "2017-04-01";

        //authenticationTokenを取得
        if (!authenticationToken || authenticationToken.length == 0) {
            authenticationToken = await this.getAuthenticationToken().catch(error => {
                throw error;
            })
        }

        //投稿url生成
        let path = getServerUrl() + `/v1/customers/${customerId}/services/${serviceId}/${apiKey}/segment/${name}/delete`;

        const fetchOptions = {
            method: "DELETE",
            mode: "cors",
            headers: {
                Accept: "application/json",
                "X-API-Version": apiVersion,
                "X-Service-Key": sdkKey,
                "Content-Type": "application/json;charset=UTF-8",
                Authorization: "Bearer " + authenticationToken,
            },
        };
        const response = await fetch(path, fetchOptions);

        if (!response.ok) {
            let body = response.json;
            throw new Error(`create segment failed.(${response.status})`);
        }
    }    
}