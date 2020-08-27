

sudo yum install nodejs go git rtl-sdr

git clone https://github.com/sirbrialliance/rtlamr-meter-utils
go get github.com/bemasher/rtlamr

sudo usermod -a -G rtlsdr someuser

cd rtlamr-meter-utils
npm install

