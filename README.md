

sudo yum install nodejs npm go git rtl-sdr supervisor

#make sure you can successfully run rtl_test



git clone https://github.com/sirbrialliance/rtlamr-meter-utils
go get github.com/bemasher/rtlamr

cd rtlamr-meter-utils
npm install


cat > /etc/supervisor/conf.d/rtlamr.conf <<ABC
[program:rtlamr]
command=node run.js
directory=/home/jstephens/bin/PowerData
redirect_stderr=true
stdout_logfile=/var/log/supervisor/rtlamr.log
autorestart=true
user=jstephens

ABC

service supervisor reload


Test with:
rsync -ravz ~/path/PowerData/ host:/path/PowerData/ --exclude=.git "--exclude=*.sqlit*" && ssh host "cd /path/PowerData/ && node run.js"

