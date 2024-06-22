# JunctionRelay

TestSender has 3 python scritps (and a .bat that launches all 3) which simulates HTTP services that broadcast fake sensors over ports 5001, 5002 and 5003. To connect to them in JunctionRelay, add the 'Generic HTTP Listener' data source and enter a URL of http://localhost:5001/data.json (change the port as needed). You do not need to populate any of the other fields.

Likewise, TestSender simulates HTTP services that receive the data from JunctionRelay, over ports 5000 and 5005. Add 'Generic HTTP Client' as the data target and enter URL of http://localhost:5000/data.json (change port as needed)
