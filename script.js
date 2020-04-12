/**
 * Список текстов приложения
 * Еще часть есть в разметке HTML
 */
const TEXTS = {
    FEELS_LIKE: 'ощущается как',
    ICON_ALT: 'погодные условия',
    ERROR_DID_NOT_SUPPORT: 'Geolocation API не поддерживается на вашем устройстве',
    ERROR_GET_WEATHER_DATA: 'Не удалось получить данные о погоде от API',
    ERROR_POSITION_UNAVAILABLE: 'Информация о геопозиции недоступна',
    ERROR_TIMEOUT: 'Запрос геопозиции завершился по таймауту',
    ERROR_UNKNOWN: 'Неизвестная ошибка',
};

/**
 * Состояния приложения
 * - загрузка
 * - требутеся доступ к геопозиции
 * - ошибка
 */
const STATE = {
    LOADING: 'loading',
    GEOLOCATION: 'geolocation',
    ERROR: 'error',
};

/**
 * Кеширование запросов к API через localStorage
 * Кеш считается устаревшим, когда с момента запроса прошло 15 минут
 * или измелись координаты пользователя
 * Признак того, что кеш устарел или отсутствует - метод get возвращает null
 */
const storage = {
    _name: 'weather-data',

    /**
     * @param {Object} coords
     * @param {number} coords.latitude
     * @param {number} coords.longitude
     * @returns {Object|null}
     */
    get (coords) {
        const store = localStorage.getItem(this._name);

        // в localStorage еще ничего не сохранили (первый запуск)
        if (!store) {
            return null;
        }

        // с момента последнего запроса api прошло больше 15 минут - кеш устарел
        if (this._itsBeen15Minutes()) {
            return null;
        }

        // за 15 минут пользователь успел оказаться в другом городе...
        // или разработчик изменил координаты через DevTools для откладки - кеш устарел :)
        if (this._isDifferentCoors(coords)) {
            return null;
        }

        return this._getStore().data;
    },

    /**
     * @param {Object} coords
     * @param {number} coords.latitude
     * @param {number} coords.longitude
     *
     * @param {Object} data
     */
    set (coords, data) {
        localStorage.setItem(this._name, JSON.stringify({
            coords,
            data,
            lastChangeTime: new Date(),
        }));
    },

    /**
     * @returns {Object}
     */
    _getStore () {
        return JSON.parse(localStorage.getItem(this._name));
    },

    /**
     * @returns {boolean}
     */
    _itsBeen15Minutes () {
        const {lastChangeTime} = this._getStore();

        const diffMs = new Date() - new Date(lastChangeTime);
        const fifteenMinutesMs = 1000 * 60 * 15;

        return diffMs > fifteenMinutesMs ? true : false;
    },

    /**
     * @param {Object} coords
     * @param {number} coords.latitude
     * @param {number} coords.longitude
     * @returns {boolean}
     */
    _isDifferentCoors ({latitude: lat, longitude: lon}) {
        const {coords: {latitude, longitude}} = this._getStore();

        const threshold = 0.01;
        const latDiff = Math.abs(latitude - lat);
        const lonDiff = Math.abs(longitude - lon);

        if (latDiff > threshold || lonDiff > threshold) {
            return true;
        }

        return false;
    },

};

/*
    Загрузка приложения происходит в четыре этапа:
    1. Показать пользователю лоадер
    2. Попробовать получить информацию о геопозиции
    3. Для полученной геопозиции запросить текущую погоду и прогноз на сутки
    4. Отрисовать полученные данные

    Если геопозиция недоступка, или запрос к API завершился ошибкой,
    то вместо лоадера показываем заглушку с ошибкой, т.к. отрисоывать нечего.

    Кроме того, кешируем ответ API на 15 минут, чтобы не отъедать личшние ресурсы
*/
setAppState(STATE.LOADING);
getGeodata();

/*
    Запрос за данными и обработка ошибок
*/

/**
 * Запрос геоданных через Geolocation API
 */
function getGeodata () {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(renderWeather, showError);
    } else {
        setErrorMessage(TEXTS.ERROR_DID_NOT_SUPPORT)
        setAppState(STATE.ERROR);
    }
}

/**
 * Получить данные о погоде для текущий геолокации и показать информацию пользователю
 * @param {Object} geodata
 * @param {Object} geodata.coords
 */
function renderWeather ({coords}) {
    getWeatherData(coords)
        .then((data) => {
            const [currentWeatherData, nextDayForecastData] = data;
            render({currentWeatherData, nextDayForecastData});
        })
        .catch((error) => {
            console.error(error);
            setErrorMessage(TEXTS.ERROR_GET_WEATHER_DATA);
            setAppState(STATE.ERROR);
        });
}

/**
 * @param {Object} coords
 * @param {number} coords.latitude
 * @param {number} coords.longitude
 */
function getWeatherData (coords) {
    const cache = storage.get(coords);

    if (cache) {
        return Promise.resolve(cache);
    }

    return fetchWeather(coords)
        .then((resp) => {
            if (!resp || hasFailedResponses(resp)) {
                throw new Error('API response has error')
            }

            storage.set(coords, resp);
            return resp;
        })
}

/**
 * @param {Object} coords
 * @param {number} coords.latitude
 * @param {number} coords.longitude
 */
function fetchWeather ({latitude: lat, longitude: lon}) {
    const apiToken = 'a4b0a5328237e10edbccf6745ccbbc3e';
    const apiParams = new URLSearchParams({
        lat,
        lon,
        appid: apiToken,
        lang: 'ru',
        units: 'metric',
    });

    const schema = 'https://'
    const currentWeatherUrlAPI = `${schema}api.openweathermap.org/data/2.5/weather`;
    const nextDayForecastUrlAPI = `${schema}api.openweathermap.org/data/2.5/forecast`;

    const currentWeatherRequestUrl = `${currentWeatherUrlAPI}?${apiParams}`;
    const nextDayForecastRequestUrl = `${nextDayForecastUrlAPI}?${apiParams}`;

    return Promise.all([
        fetch(currentWeatherRequestUrl),
        fetch(nextDayForecastRequestUrl),
    ]).then(([firstResp, secondResp]) => {
        return Promise.all([
            firstResp.json(),
            secondResp.json(),
        ]);
    });
}

/**
 * Промежуточные состояния приложения до его полной загрузки
 * Как только приложение загрузилось - убираем промежуточные состояния
 * @param {string} state '' | LOADING | GEOLOCATION | ERROR
 */
function setAppState (state) {
    const app = document.getElementById('app');

    const classPrefix = 'app_state_';
    const classLoading = `${classPrefix}${STATE.LOADING}`;
    const classGeolocation = `${classPrefix}${STATE.GEOLOCATION}`;
    const classError = `${classPrefix}${STATE.ERROR}`;

    switch (state) {
        case STATE.LOADING: {
            app.classList.add(classLoading);
            break;
        }
        case STATE.GEOLOCATION: {
            app.classList.remove(classLoading);
            app.classList.add(classGeolocation);
            break;
        }
        case STATE.ERROR: {
            app.classList.remove(classLoading);
            app.classList.add(classError);
            break;
        }
        default: {
            app.classList.remove(classLoading);
        }
    }
}

/**
 * Отобразить информацию об ошибке в интерфейсе
 * @param {string} message
 */
function setErrorMessage (message) {
    document.getElementById('error-message').innerText = message;
}

/**
 * Получает список ответов от API и проверяет, что все завершились успешно
 * Признак успеха поле cod, которое содержит код в виде строки или числа
 * @param {Array} responses
 * @returns {boolean}
 */
function hasFailedResponses (responses) {
    const isNotOk = ({cod}) => Number(cod) !== 200;
    const failedResponses = responses.filter(isNotOk);

    if (failedResponses.length > 0) {
        logFailedResponses(failedResponses);
        return true;
    }

    return false;
}

/**
 * Вывести информация о неудачных запросах
 * @param {Object} failedResponses
 */
function logFailedResponses (failedResponses) {
    failedResponses.forEach(({cod, message}) => {
        console.error('Respons Failed:', cod, message);
    });
}

/**
 * Обработчик ошибок для Geolocation API в getCurrentPosition
 * @param {Ojbect} error
 */
function showError (error) {
    switch (error.code) {
        case error.PERMISSION_DENIED: {
            setAppState(STATE.GEOLOCATION);
            break;
        }
        case error.POSITION_UNAVAILABLE: {
            setErrorMessage(TEXTS.ERROR_POSITION_UNAVAILABLE);
            setAppState(STATE.ERROR);
            break;
        }
        case error.TIMEOUT: {
            setErrorMessage(TEXTS.ERROR_TIMEOUT);
            setAppState(STATE.ERROR);
            break;
        }
        case error.UNKNOWN_ERROR: {
            setErrorMessage(TEXTS.ERROR_UNKNOWN);
            setAppState(STATE.ERROR);
            break;
        }
    }
}

/*
    Отрисовка приложения
*/

/**
 * Отрисовать приложение и убрать состояние загрузки
 * @param {Oject} data
 * @param {Oject} data.currentWeatherData
 * @param {Oject} data.nextDayForecastData
 */
function render ({currentWeatherData, nextDayForecastData}) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(renderCurrentWeather(currentWeatherData))
    fragment.appendChild(renderForecast(nextDayForecastData))

    const content = document.getElementById('content');
    content.appendChild(fragment);
    setAppState('');
}

/**
 * Отрисовать блок с текущей погодой
 * @param {Object} data
 * @returns {DOM.Element}
 */
function renderCurrentWeather (data) {
    const {name: cityName} = data;
    const {temp, icon, description, feelsLike} = normalizeDataForUI(data);

    const blockName = 'current-weather';
    const b = (elem) => `${blockName}__${elem}`;

    const weather = [
        createElem('div', b('temp'), temp),
        createIcon(icon, b('icon'))
    ];

    const content = [
        createElem('div', b('city'), cityName),
        createContainer(b('weather'), weather),
        createElem('div', b('description'), description),
        createElem('div', b('feels-like'), `${TEXTS.FEELS_LIKE} ${feelsLike}`),
    ];

    return createContainer(blockName, content);
}

/**
 * Отрисовать прогноз погоды на сутки вперед
 * @param {Object} data
 * @returns {HTMLElement}
 */
function renderForecast (data) {
    const nextDayIntervals = getNextDayWeather(data);

    const blockName = 'forecast';
    const b = (elem) => `${blockName}__${elem}`;

    const content = nextDayIntervals.map((weather) => {
        const {time, icon, description, temp, feelsLike} = weather;
        const content = [
            createElem('span', b('time'), time),
            createIcon(icon, b('icon')),
            createElem('span', b('description'), description),
            createElem('span', b('temp'), temp),
            createElem('span', b('feels-like'), feelsLike),
        ];

        return createContainer(b('hours'), content);
    });

    return createContainer(blockName, content);
}

/**
 * Хелпер для создания HTML контейнера c элементами внутри
 * @param {Object} data
 * @param {Array<HTMLElement>}
 * @returns {HTMLElement}
 */
function createContainer (className, content) {
    const container = createElem('div', className);
    content.forEach((elem) => {
        container.appendChild(elem);
    });
    return container;
}

/**
 * Хелпер для создания HTML элемента с классом и текстом
 * @param {string} tag
 * @param {string} className
 * @param {string} textContent
 * @returns {HTMLElement}
 */
function createElem (tag, className, textContent) {
    const elem = document.createElement(tag);
    elem.classList.add(className);

    if (textContent) {
        elem.textContent = textContent;
    }

    return elem;
}

/**
 * Хелпер для создания иконки с погодой
 * @param {string} iconId
 * @param {string} className
 * @returns {HTMLElement}
 */
function createIcon (iconId, className) {
    const src = `https://openweathermap.org/img/wn/${iconId}@2x.png`;
    const img = document.createElement('img');
    img.classList.add(className);
    img.alt = TEXTS.ICON_ALT;
    img.src = src;

    return img;
}

/**
 * Получить погоду на следующие сутки из ответа API с прогнозом на 5 дней
 * @param {Object} data
 * @param {Array} list
 */
function getNextDayWeather ({list: weatherList}) {
    const intervalHours = 3;
    const dayLenHours = 24;
    const intervalsCount = dayLenHours / intervalHours;
    const dayIntervals = weatherList.slice(0, intervalsCount);

    return dayIntervals.map(normalizeDataForUI);
}

/**
 * Взять из данных API только нужные поля для отрисовки в интерфейсе
 * @param {Object} weatherObject
 * @returns {Object}
 */
function normalizeDataForUI (weatherObject) {
    const {main, weather: [primaryWeather], dt: timestemp} = weatherObject;
    return {
        time: normalizeTime(timestemp),
        temp: normalizeTemp(main.temp),
        feelsLike: normalizeTemp(main.feels_like),
        icon: primaryWeather.icon,
        description: primaryWeather.description,
    }
}

/**
 * Преобразовать timestemp из ответа API во время в формате HH:MM
 * @param {number} timestemp
 */
function normalizeTime (timestemp) {
    const date = new Date(timestemp * 1000);
    const hours = date.getHours();
    return `${String(hours).padStart(2, '0')}:00`;
}

/**
 * Округлить значение температуры и добавить знак
 * @param {number} temp
 */
function normalizeTemp (temp) {
    const degree = Math.round(temp);
    const sign = degree === 0 ? '' : (degree > 0 ? '+' : '-');
    return `${sign}${Math.abs(degree)}`;
}