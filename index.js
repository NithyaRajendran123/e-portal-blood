require('dotenv').config();
var debug = require('debug')('http');
var morgan = require('morgan');
var express = require('express');
var bodyParser = require('body-parser');
var path = require('path');
var cookieParser = require('cookie-parser');
var app = express();
var mongoose = require('mongoose');
var userModel = require('./models/user');

const KEY = 'MYKEY';
const dburi =
  'mongodb+srv://admin:admin@cluster0.ajn0t.mongodb.net/blood?retryWrites=true';
const signature = {
  signed: KEY,
  maxAge: 2 * 24 * 60 * 60 * 1000,
};
const escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};

app.use(morgan('dev'));

mongoose.connect(
  dburi,
  { useNewUrlParser: true, useCreateIndex: true },
  (err) => {
    if (err) throw err;
    else console.log('Connected to mongoDb');
  }
);

app.use(express.static('public/js'));
app.use(express.static('public/css'));
app.use(express.static('public/img'));
app.use(express.static('public/json'));
app.use(cookieParser(KEY));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.get('/', (req, res) => {
  // res.sendFile(path.join(__dirname, 'public/index.html'));
  if (req.signedCookies.user == null) {
    res.render('index', { logged: false });
    return;
  }
  res.render('index', { logged: req.signedCookies.user });
});

app.get('/admin', (req, res) => {
  if (req.signedCookies.admin) {
    res.redirect('/adminpanel');
    return;
  }
  res.render('admin', { invalid: false });
});

app.get('/adminlogout', (req, res) => {
  res.clearCookie('admin');
  res.redirect('admin');
});

app.post('/admin', (req, res) => {
  if (req.body.password.toLowerCase() == 'admin') {
    res.cookie('admin', 'admin', signature);
    res.redirect('/adminpanel');
    return;
  } else {
    res.render('admin', { invalid: true });
  }
  // res.send('invalid credentials');
});

app.get('/adminpanel', (req, res) => {
  // res.render('admin.ejs');
  if (!req.signedCookies.admin) {
    res.redirect('/admin');
    return;
  }
  if (req.query.blood == undefined || req.query.blood == '')
    req.query.blood = '(A|B|O|AB)';

  if (req.query.rh != undefined) req.query.blood += escapeRegExp(req.query.rh);
  else req.query.blood += '[\\+-]';

  if (req.query.city == undefined) req.query.city = '';

  var page = req.query.page;
  if (page === undefined || page < 1) page = 1;

  var query = {
    $and: [
      { bloodGroup: { $regex: req.query.blood, $options: 'i' } },
      { city: { $regex: req.query.city, $options: 'i' } },
    ],
  };

  userModel.find(
    query,
    null,
    {
      sort: {
        amount: -1,
      },
      limit: 10000,
      skip: (page - 1) * 18,
    },
    function (err, docs) {
      if (err) res.send(err);
      res.render('adminpanel', { docs: docs });
    }
  );
});

app.get('/adminpanel/delete/:id', (req, res) => {
  userModel.findOneAndRemove(
    {
      _id: req.params.id,
    },
    function (err, user) {
      if (err) throw err;

      console.log('Success' + user);
    }
  );

  res.redirect('/adminpanel');
});

app.post('/adminpanel/edit/:id', (req, res) => {
  userModel.findByIdAndUpdate(req.params.id, req.body, function (err, docs) {
    if (err) {
      console.log(err);
      res.send(err);
    } else {
      console.log('Updated User : ', docs);
      res.redirect('/adminpanel');
    }
  });

  // userModel.findOne({ phone: phone }, function (err, doc) {
  //   if (err) {
  //     res.redirect('/adminpanel');
  //     throw err;
  //   } else {
  //     docs.push(doc);
  //     res.render('adminedit', { doc: docs });
  //   }
  // });
  // res.send(req.params.id);
});

app.get('/adminpanel/delete/:id', (req, res) => {
  userModel.findOneAndRemove(
    {
      _id: req.params.id,
    },
    function (err, user) {
      if (err) throw err;

      console.log('Success' + user);
    }
  );

  res.redirect('/adminpanel');
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.post('/register', (req, res) => {
  debug(req.body);
  userModel
    .findOne({ phone: req.body.phone })
    .then((user) => {
      if (user == null) {
        new userModel({
          name: req.body.name.toUpperCase(),
          bloodGroup: req.body.blood.toUpperCase() + req.body.rh,
          city: req.body.city.toUpperCase(),
          phone: req.body.phone,
          email: req.body.email,
          password: req.body.password,
          amount: req.body.amount || 0,
          address: req.body.address,
        })
          .save()
          .then((user) => {
            res.cookie('user', user.phone, signature);
            res.redirect('/donate');
          })
          .catch((err) => {
            res.send(err.message + '\nPlease go Back and try again.');
          });
      } else {
        res.cookie('user', user.phone, signature);
        res.redirect('/donate');
      }
    })
    .catch((err) => {
      res.send(err.message);
    });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  debug(req.body);
  userModel
    .findOne({ email: req.body.email, password: req.body.password })
    .then((user) => {
      if (user == null) {
        res.send('Login failure');
      } else {
        res.cookie('user', user.phone, signature);
        res.redirect('/donate');
      }
    })
    .catch((err) => {
      res.send(err.message);
    });
});

app.post('/donate', (req, res) => {
  if (req.body.amount == undefined || req.body.amount <= 0) {
    res.redirect('back');
    return;
  }
  userModel.findOne({ phone: req.signedCookies.user }, function (err, user) {
    if (err) res.send(err);
    if (!user) {
      res.redirect('/logout');
      console.error('WTF should not happen.');
      return;
    }
    user.amount += parseFloat(req.body.amount);
    user
      .save({
        validateBeforeSave: true,
      })
      .then(res.redirect('/donate'))
      .catch((err) => {
        res.send(err.message);
      });
  });
});

app.get('/donate', (req, res) => {
  debug(req.signedCookies.user);
  if (req.signedCookies.user) {
    // Greet user and Ask how much to donate
    userModel
      .findOne({ phone: req.signedCookies.user })
      .then((user) => {
        if (user == null) {
          // Should not happen
          console.error('WTF should not happen.');
          res.redirect('/logout');
        } else {
          debug(
            user.createdAt,
            user.updatedAt,
            user.createdAt - user.updatedAt
          );
          res.render('donate', {
            user: {
              name: user.name,
              amount: user.amount,
              lastDonated:
                user.createdAt - user.updatedAt == 0
                  ? 'Never.'
                  : user.updatedAt,
            },
          });
        }
      })
      .catch((err) => {
        console.error(err);
        res.send(err.message);
      });
  } else {
    res.redirect('/login');
  }
});

app.get('/bank', (req, res) => {
  if (req.signedCookies.user == null) {
    res.redirect('/login');
    return;
  }

  if (req.query.blood == undefined || req.query.blood == '')
    req.query.blood = '(A|B|O|AB)';

  if (req.query.rh != undefined) req.query.blood += escapeRegExp(req.query.rh);
  else req.query.blood += '[\\+-]';

  if (req.query.city == undefined) req.query.city = '';

  var page = req.query.page;
  if (page === undefined || page < 1) page = 1;

  var query = {
    $and: [
      { bloodGroup: { $regex: req.query.blood, $options: 'i' } },
      { city: { $regex: req.query.city, $options: 'i' } },
    ],
  };

  userModel.find(
    query,
    null,
    {
      sort: {
        amount: -1,
      },
      limit: 18,
      skip: (page - 1) * 18,
    },
    function (err, docs) {
      if (err) res.send(err);
      res.render('bank', { docs: docs, logged: req.signedCookies.user });
    }
  );
});

app.get('/logout', (req, res) => {
  res.clearCookie('user');
  res.redirect('/');
});

var port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log('App listening on port ' + port + '!');
});
