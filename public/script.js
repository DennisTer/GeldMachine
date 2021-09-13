const socket = io('/')


let labels = ['Now','Then']
let prices = [1,2];
let shortSMA = [1,1];
let mediumSMA = [3,2];
let longSMA = [2,1];
let digitaleEuro;
let lastEUROS;
var ctx = document.getElementById('myChart').getContext('2d');
var ctx_2 = document.getElementById('myChartMarket').getContext('2d');
var myChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: labels,
        datasets: [{
            label: 'Prijs',
            data: prices,
            backgroundColor: 'black',
            borderColor: 'black',
            lineTension: 0.5           
        },
        {
            label: 'Short SMA',
            data: shortSMA,
            backgroundColor: 'green',
            borderColor: 'green',
            lineTension: 0.5               
        },
        {
            label: 'Medium SMA',
            data: mediumSMA,
            backgroundColor: 'blue',
            borderColor: 'blue',
            lineTension: 0.5              
        },
        {
            label: 'Long SMA',
            data: longSMA,
            backgroundColor: 'red',
            borderColor: 'red',
            lineTension: 0.5             
        },
    ],
      
    },
    options: {
        scales: {
            y: {
                beginAtZero: false
            }
        }
    }
});
var myChartMarket = new Chart(ctx_2, {
    type: 'line',
    data: {
        labels: labels,
        datasets: [{
            label: 'Som van alle prijzen',
            data: prices,
            backgroundColor: 'black',
            borderColor: 'black',
            lineTension: 0.5           
        }
    ],
      
    },
    options: {
        scales: {            
            y: {
                beginAtZero: false
            }
        }
    }
});


socket.on('user-connected', function(msg) {
    console.log('We Have a COnneectionnnnn!!!!')
});

socket.on('Status', function(counter, coinHeroName) {
    console.log('Loop count = ' + counter + '. coinHero = ' + coinHeroName)
});

socket.on('Test', function() {
    console.log('Recieved TEST from server')
});

socket.on('BuyStatus', function(aankoopArray, digiEUR, pricess , sSMA, mSMA, lSMA, lab, score, hr1percentage, hr24percentage, RSI) {
    console.log('BUY Status recieved, updating the chart')
    var coin = document.getElementById('trackCoin')
    coin.innerText = aankoopArray[0][0] + '. Totaal Euros = ' + digiEUR.toFixed(2) + '. En Score = ' + score.toFixed(2)
    var coin2 = document.getElementById('trackCoin2')
    coin2.innerText = '24 Hrs trend = ' + hr24percentage.toFixed(2) + '%. 1 Hr trend = ' + hr1percentage.toFixed(2) + '%. En RSI = ' + RSI
    

    //console.log(pricess)
    //console.log(sSMA)
    let sSMAfloats = []
    let mSMAfloats = []
    let lSMAfloats = []

    let labels = []
    for (let i = 0; i < lab.length; i++) {
        var d = new Date(lab[i])
        labels.push(d.toLocaleString());
      }

    for (let i = 0; i < sSMA.length; i++) {
        sSMAfloats.push(parseFloat(sSMA[i]));
      }
    for (let i = 0; i < mSMA.length; i++) {
        mSMAfloats.push(parseFloat(mSMA[i]));
      }
    for (let i = 0; i < lSMA.length; i++) {
        lSMAfloats.push(parseFloat(lSMA[i]));
      }

    myChart.data.labels = labels;
    myChart.data.datasets[0].data = pricess;
    
    myChart.data.datasets[1].data = sSMAfloats;
    myChart.data.datasets[2].data = mSMAfloats;
    myChart.data.datasets[3].data = lSMAfloats;
    myChart.update();
    //play()
    //console.log( pricess.length + ' ' + sSMAfloats.length + ' ' + mSMAfloats.length + ' ' + lSMAfloats.length )
    //console.log(lab)

    digitaleEuro = digiEUR
    if ( digitaleEuro > lastEUROS) { play() }
    lastEUROS = digitaleEuro
    
});

socket.on('MarketStatus', function(MarketSumArray, MarketSumArrayTimes, wholeMarketTrend) {
    if (wholeMarketTrend){
    console.log('MARKET Status recieved, updating the whole market chart')
    var marketpercent = document.getElementById('wholeMarket')
    marketpercent.innerText = 'Trend van de hele markt = ' + wholeMarketTrend.toFixed(2) + ' %'

    let labels = []
    for (let i = 0; i < MarketSumArrayTimes.length; i++) {
        var d = new Date(MarketSumArrayTimes[i])
        labels.push(d.toLocaleString());
      }
    
    myChartMarket.data.labels = labels;
    myChartMarket.data.datasets[0].data = MarketSumArray;
    myChartMarket.update();
    }
    //console.log(MarketSumArrayTimes)
});

socket.on('Sell', function(text, reason) {
    
    var consoleDiv = document.getElementById('consoleDiv')
    var a = document.createElement("a");
    var d = new Date()
    var newtext = d.toLocaleString() + ' : ' + text + ' with reason ' + reason.toFixed(2);
    a.innerHTML = newtext
    consoleDiv.appendChild(a);
});

socket.on('Buy', function(text) {
    
    var consoleDiv = document.getElementById('consoleDiv')
    var a = document.createElement("a");
    var d = new Date()
    var newtext = d.toLocaleString() + ' : ' + text;
    a.innerHTML = newtext
    consoleDiv.appendChild(a);
});

function play() {
    var audio = document.getElementById("audio");
    audio.play();
  }

