function getParkingVerdict(hasSignPhoto){if(!hasSignPhoto)return{verdict:"unknown",title:"Потрібне фото знака",explanation:"Сфотографуйте дорожній знак перед паркуванням."};return{verdict:"check",title:"Перевірте знак і розмітку",explanation:"Автоматичне розпізнавання ще не підключене."};}
function getRemainingMs(expiresAt,now=Date.now()){return Math.max(0,expiresAt-now);}
module.exports={getParkingVerdict,getRemainingMs};
