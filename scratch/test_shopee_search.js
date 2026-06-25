const axios = require('axios');

async function testDirect() {
  const keyword = 'garrafa termica';
  const url = `https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=10&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
    'Referer': 'https://shopee.com.br/search?keyword=' + encodeURIComponent(keyword),
    'X-API-Source': 'pc',
    'Cookie': 'SPC_F=NqgrqhoqEtQkC7kWhhaYBJxAMHxrC0S2; REC_T_ID=caf7ae77-5f3e-11f1-a819-1ec41480213e; language=pt-BR; SPC_CLIENTID=TnFncnFob3FFdFFrbpjonrtpyvvbxyas; _fbp=fb.2.1780485992357.636671682693657363; _gcl_au=1.1.1675778240.1780485992; _ga=GA1.1.30898110.1780485992; csrftoken=S9ZG8nzD1nm0bvCy5oCX6KjLBoyOo0hK; SPC_SI=V6EragAAAAB1cDB6NEpNUNBHAgAAAAAAMTZxUFRHSWU=; SPC_ST=VUozWk0zVUpaRFhjcW82M0ym71XL2rOHPlIO2ymnVYTlBE2rtMwQvEkaBWY0KKMSn1XnbFH8zQhh63XT36A7YCoK2h8DI2KJF29MhBAVj9EmFl+7yL2aHRjeEU7Ew+yMrFjlEFsEwjHnJw3PXKV/kDvkp2uf9hLvKybFR4rRManbPVeUnmDNMdW7ADTkhcbMvme5rQOpppg477ycpBiUCQ==.ACWswvkkZLADQyE76XzLlGZTPdRZyMmd11lJQGVlOs1q; SPC_U=810585119; SPC_EC=OXVxOFJuc3pnaUQ1emNpNtwStEl14CAqU85OA6jtCWwEifxNPrmxr4dyAGMaD482fkWT8N5R6tCwd3FWKPNJ0cx4pBQkbOHav5/s56tFLHFDaurir8EeiDiucyVkDilVQC2vIDbU1lu8uIULxvuxnE4Vm3PXfprDV/a0c1/sfcCQ0B4sKiR5rGMEF8K6o115VJYsckpARMlLk8OY1TVCfg==.AFLTV3zyEnpJHtMkEMeTeYWR99ySodc1w+T0fcFoOaPX; SPC_R_T_ID=DcH9bQq7RFWTQKrA9TRiL/ENPFIwmWNpAMM+6m8wcuhldTXPGnoWZJbZPGIWKrRqmnv5HLH2Kwb3i3UshSRl/nxn8Bqm3c4rVpS9U8T6nJUTsZ+WCOZXjgTZ+JzJK2YOSIvmm7ddLJm8R+nAB9+M1SLrBucjmFvM+niBELgHM0U=; SPC_R_T_IV=clA2UUNscXN6OURlc25Hag==; SPC_T_ID=DcH9bQq7RFWTQKrA9TRiL/ENPFIwmWNpAMM+6m8wcuhldTXPGnoWZJbZPGIWKrRqmnv5HLH2Kwb3i3UshSRl/nxn8Bqm3c4rVpS9U8T6nJUTsZ+WCOZXjgTZ+JzJK2YOSIvmm7ddLJm8R+nAB9+M1SLrBucjmFvM+niBELgHM0U=; SPC_T_IV=clA2UUNscXN6OURlc25Hag==; SPC_CDS_CHAT=f073779c-0a29-4b57-9c07-a492d40543b6; SPC_SC_SESSION=gfCehvVhHdWQf2EKOcP12QvVRBMltDMRhUU4r72Sn9H2220PA1PfiUPQkzLa6C3HKBOVI2Qxo1/Ja7wRzGHMQZkqLzCEwxmaUofU6jhsjX+2fD8HRo01R0ZUsuRY4bcVGeok7DT3GJ5oG+6TYtQ9IxGn3HHolBcCtddatPOl66pJMXvl0TcQz1k1NTEmtb7LwflG+BlqBSBeV7SBT5DA0DGDpvl1/jri/gyPX1u0MFep7hjHdy3WNEkJCPCOyHxoH+AQxfypAgGZOqli88tVn7A==_1_810585119; SPC_SC_MAIN_SHOP_SA_UD=0; SPC_STK=s/ouRtNw0pq30vlI3SPnv+NdSNukMOWed3Y2SEF1mxzO+vQxzpIUVMpKDwyt4ljIjzd12ARR+f3L0gJJ7uYRQIbsER99ZJPYe587b8EMG4PPM76GMyUrkogXfKdUtAzcJo7V3IKM3X0DakCBsNq7FBEIp5IupXREW6Lt/YTlXD++U7VS/PJImx5C5YQj3ptRaP+dfxurFe12bzWsfcxg59WVzrGM9tT6S5hD0X39nOsyta3nFFHOPRLqDcQ+CBYp8wph8J+QCTFOSd6LXs3Jc7zVtz3NtpY1FXcRDEWs6K7HDRnVqnefQh6WFxvdWNDwIoDDHy/88QYHVaA+IEgcT55CIlfT9wGAOAJLv2gUHqSkaqHA3/UC7hI8OjMXnt9ipit3qj+ZqO2l2muoGyzB8KX8OHjDFyRaNLRbQeDJYtnduVJExx/CVzxlCSQ1VxmNQp4CCg4Z1v9S7etjGWYpYyQLFEgoMoVvUyofqhRnmNJCmfjD65fmc8jum8u3IreF; SC_DFP=cPxassiUiKOzybZCekQHewEHOhxuMAyV; CTOKEN=NiW3HmZWEfGsex42hsW%2BRw%3D%3D; sense_sa_r=s; _med=cpc; _gcl_aw=GCL.1781265647.Cj0KCQjw3K7RBhDJARIsAKRtP5QZ4vkPeYR3VV77J55oZu9AOUn49ZAS_UD0SejYdTfACLQ-cBXfDpMaAp5eEALw_wcB; _gcl_gs=2.1.k1$i1781265644$u48932068; language=pt-BR; _QPWSDCXHZQA=ce226264-fc26-48d4-b534-10486317bc2a; REC7iLP4Q=a1921a98-8bff-4a65-86ef-bbe3cc961d1c; _sapid=02074ba5fef360cf075a87a7b5b2f9d0c21c0ab0855ea5576b24475d; shopee_webUnique_ccd=VDRfYO21T1ec3qsVNyILpQ%3D%3D%7C13wc2Zm%2FYfTW41fjaZM3odLcliGrv%2BSoITrVHL48O9%2FTrrk2el9GGvPdaSxysk%2B8vZ1dYaaD8iZCxzI%3D%7CDE3bOV1su7xMd2uO%7C08%7C3; ds=1fba014293df3a7962f19023ae312ef8; _ga_T69DLR1QPG=GS2.1.s1781263927$o2$g1$t1781265901$j29$l0$h907647221; link_social_media_810585119=1'
  };

  try {
    console.log('Sending direct request to Shopee search API...');
    const res = await axios.get(url, { headers, timeout: 10000 });
    console.log('Direct status:', res.status);
    console.log('Data returned:', typeof res.data, Object.keys(res.data));
    if (res.data && res.data.items) {
      console.log(`Found ${res.data.items.length} items!`);
      console.log('First item title:', res.data.items[0].item_basic ? res.data.items[0].item_basic.name : 'N/A');
    } else {
      console.log('No items returned in direct request.');
    }
  } catch (e) {
    console.error('Direct error:', e.message);
    if (e.response) {
      console.error('Direct error status:', e.response.status);
      console.error('Direct error headers:', e.response.headers);
    }
  }
}

async function testAllOrigins() {
  const keyword = 'garrafa termica';
  const targetUrl = `https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=10&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

  try {
    console.log('\nSending proxy request via AllOrigins...');
    const res = await axios.get(proxyUrl, { timeout: 15000 });
    console.log('Proxy status:', res.status);
    let parsedData = res.data;
    if (typeof res.data === 'string') {
      parsedData = JSON.parse(res.data);
    }
    const contents = parsedData.contents;
    if (contents) {
      const data = JSON.parse(contents);
      console.log('Proxy response parsed successfully!');
      if (data.items) {
        console.log(`Proxy found ${data.items.length} items!`);
        console.log('Proxy first item title:', data.items[0].item_basic ? data.items[0].item_basic.name : 'N/A');
      } else {
        console.log('Proxy no items returned.');
      }
    } else {
      console.log('No contents in proxy response.');
    }
  } catch (e) {
    console.error('Proxy error:', e.message);
  }
}

async function run() {
  await testDirect();
  await testAllOrigins();
}

run();
