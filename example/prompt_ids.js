const inquirer = require("inquirer");

const ids = {
  customerId: process.env.CUSTOMER_ID,
  serviceId: process.env.SERVICE_ID,
  apiKey: process.env.API_KEY,
  sdkKey: process.env.SDK_KEY,
};

module.exports = {
    setIds:async () => {
        ids.customerId = await prompt("顧客IDを指定してください。", ids.customerId);
        ids.serviceId = await prompt("サービスIDを指定してください。", ids.serviceId);
        ids.apiKey = await prompt("APIキーを指定してください。", ids.apiKey, true);
        ids.sdkKey = await prompt("SDKキーを指定してください。", ids.sdkKey, true);
        return ids;
    }
};

const prompt = async (message, defaultValue, isSecret = false) => {
  const question = {
    name: "result",
    message:
      isSecret && defaultValue
        ? `${message}（環境変数設定済み。Enterでその値を使用します）`
        : message,
    type: isSecret ? "password" : "input",
  };
  if (isSecret) {
    question.mask = "*";
  } else {
    question.default = defaultValue;
  }

  const answers = await inquirer.prompt([question]);
  if (isSecret && answers.result === "" && defaultValue) {
    return defaultValue;
  }
  return answers.result;
};
