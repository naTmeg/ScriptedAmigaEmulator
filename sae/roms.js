/*-------------------------------------------------------------------------
| SAE - Scripted Amiga Emulator
| https://github.com/naTmeg/ScriptedAmigaEmulator
|
| Copyright (C) 2012 Rupert Hausberger
|
| This program is free software; you can redistribute it and/or
| modify it under the terms of the GNU General Public License
| as published by the Free Software Foundation; either version 2
| of the License, or (at your option) any later version.
|
| This program is distributed in the hope that it will be useful,
| but WITHOUT ANY WARRANTY; without even the implied warranty of
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
| GNU General Public License for more details.
|
| Note: ported from WinUAE 3.2.x
-------------------------------------------------------------------------*/
/* global constants */

//const SAEC_RomType_SUB_MASK		= 0x000000ff;
//const SAEC_RomType_GROUP_MASK	= 0x003fff00;
//const SAEC_RomType_MASK			= 0x003fffff;

const SAEC_RomType_KICK			= 0x00000100;
const SAEC_RomType_KICKCD32		= 0x00000200;
const SAEC_RomType_EXTCD32		= 0x00000400;
const SAEC_RomType_EXTCDTV		= 0x00000800;
const SAEC_RomType_KEY				= 0x00001000;
//const SAEC_RomType_ARCADIABIOS	= 0x00002000;
//const SAEC_RomType_ARCADIAGAME	= 0x00004000;
const SAEC_RomType_CD32CART		= 0x00008000;
//const SAEC_RomType_SPECIALKICK	= 0x00010000;

/*const SAEC_RomType_CPUBOARD	0x00040000
const SAEC_RomType_CB_A3001S1	0x00040001
const SAEC_RomType_CB_APOLLO	0x00040002
const SAEC_RomType_CB_FUSION	0x00040003
const SAEC_RomType_CB_DKB12x0	0x00040004
const SAEC_RomType_CB_WENGINE	0x00040005
const SAEC_RomType_CB_TEKMAGIC	0x00040006
const SAEC_RomType_CB_BLIZ1230	0x00040007
const SAEC_RomType_CB_BLIZ1260	0x00040008
const SAEC_RomType_CB_BLIZ2060	0x00040009
const SAEC_RomType_CB_A26x0	0x0004000a
const SAEC_RomType_CB_CSMK1	0x0004000b
const SAEC_RomType_CB_CSMK2	0x0004000c
const SAEC_RomType_CB_CSMK3	0x0004000d
const SAEC_RomType_CB_CSPPC	0x0004000e
const SAEC_RomType_CB_BLIZPPC	0x0004000f
const SAEC_RomType_CB_GOLEM030	0x00040010
const SAEC_RomType_CB_ACA500	0x00040011
const SAEC_RomType_CB_DBK_WF	0x00040012
const SAEC_RomType_CB_EMATRIX	0x00040013
const SAEC_RomType_CB_SX32PRO	0x00040014

const SAEC_RomType_FREEZER		0x00080000
const SAEC_RomType_AR			0x00080001
const SAEC_RomType_AR2			0x00080002
const SAEC_RomType_HRTMON		0x00080003
const SAEC_RomType_NORDIC		0x00080004
const SAEC_RomType_XPOWER		0x00080005
const SAEC_RomType_SUPERIV		0x00080006

const SAEC_RomType_SCSI		0x00100000
const SAEC_RomType_A2091		0x00100001
const SAEC_RomType_A4091		0x00100002
const SAEC_RomType_BLIZKIT4	0x00100003
const SAEC_RomType_FASTLANE	0x00100004
const SAEC_RomType_OKTAGON		0x00100005
const SAEC_RomType_GVPS1		0x00100006
const SAEC_RomType_GVPS12		0x00100007
const SAEC_RomType_GVPS2		0x00100008*/
const SAEC_RomType_AMAX		= 0x00100009;
/*const SAEC_RomType_ALFA		0x0010000a
const SAEC_RomType_ALFAPLUS	0x0010000b
const SAEC_RomType_APOLLO		0x0010000c
const SAEC_RomType_MASOBOSHI	0x0010000d
const SAEC_RomType_SUPRA		0x0010000e
const SAEC_RomType_A2090		0x0010000f
const SAEC_RomType_GOLEM		0x00100010
const SAEC_RomType_STARDRIVE	0x00100011
const SAEC_RomType_KOMMOS		0x00100012
const SAEC_RomType_VECTOR		0x00100013
const SAEC_RomType_ADIDE		0x00100014
const SAEC_RomType_MTEC		0x00100015
const SAEC_RomType_PROTAR		0x00100016
const SAEC_RomType_ADD500		0x00100017
const SAEC_RomType_KRONOS		0x00100018
const SAEC_RomType_ADSCSI		0x00100019
const SAEC_RomType_ROCHARD		0x0010001a
const SAEC_RomType_CLTDSCSI	0x0010001b
const SAEC_RomType_PTNEXUS		0x0010001c
const SAEC_RomType_DATAFLYER	0x0010001d
const SAEC_RomType_SUPRADMA	0x0010001e
const SAEC_RomType_GREX		0x0010001f
const SAEC_RomType_PROMETHEUS	0x00100020
const SAEC_RomType_MEDIATOR	0x00100021
const SAEC_RomType_TECMAR		0x00100022
const SAEC_RomType_XEBEC		0x00100023
const SAEC_RomType_MICROFORGE	0x00100024
const SAEC_RomType_PARADOX		0x00100025
const SAEC_RomType_HDA506		0x00100026
const SAEC_RomType_ALF1		0x00100027
const SAEC_RomType_PROMIGOS	0x00100028
const SAEC_RomType_SYSTEM2000	0x00100029
const SAEC_RomType_A1060		0x0010002a
const SAEC_RomType_A2088		0x0010002b
const SAEC_RomType_A2088T		0x0010002c
const SAEC_RomType_A2286		0x0010002d
const SAEC_RomType_A2386		0x0010002e
const SAEC_RomType_OMTIADAPTER	0x0010002f
const SAEC_RomType_X86_HD		0x00100030
const SAEC_RomType_X86_AT_HD1	0x00100031
const SAEC_RomType_X86_AT_HD2	0x00100032
const SAEC_RomType_X86_XT_IDE	0x00100033
const SAEC_RomType_PICASSOIV	0x00100034
const SAEC_RomType_x86_VGA		0x00100035
const SAEC_RomType_APOLLOHD	0x00100036
const SAEC_RomType_MEVOLUTION	0x00100037
const SAEC_RomType_GOLEMFAST	0x00100038
const SAEC_RomType_PHOENIXB	0x00100039*/

const SAEC_RomType_NOT			= 0x00800000;
const SAEC_RomType_QUAD		= 0x01000000;
const SAEC_RomType_EVEN		= 0x02000000;
const SAEC_RomType_ODD			= 0x04000000;
const SAEC_RomType_8BIT		= 0x08000000;
const SAEC_RomType_BYTESWAP	= 0x10000000;
const SAEC_RomType_CD32		= 0x20000000;
const SAEC_RomType_SCRAMBLED	= 0x40000000;
const SAEC_RomType_NONE		= 0x80000000;

const SAEC_RomType_ALL_KICK	= (SAEC_RomType_KICK | SAEC_RomType_KICKCD32 | SAEC_RomType_CD32) >>> 0;
const SAEC_RomType_ALL_EXT	= (SAEC_RomType_EXTCD32 | SAEC_RomType_EXTCDTV) >>> 0;
//const SAEC_RomType_ALL_CART	= (SAEC_RomType_AR | SAEC_RomType_HRTMON | SAEC_RomType_NORDIC | SAEC_RomType_XPOWER | SAEC_RomType_CD32CART) >>> 0;
const SAEC_RomType_ALL_CART	= (SAEC_RomType_CD32CART) >>> 0;

/*---------------------------------*/
/* global object */

function SAEO_RomInfo() { //struct rominfo
	this.name = 0;
	this.models = "";
	this.ver = 0;
	this.rev = 0;
	this.subVer = 0;
	this.subRev = 0;
	this.cpu = 0;
	this.cpuExact = false;
	this.addressSpace24 = false;
	this.cloanto = false;
	this.type = 0;
	this.partNumber = "";
	this.crc32 = 0;
	this.checksum = false; /* false = checksum is not available */
	this.checksumValid = false; /* false = checksum is not available */
}

/*---------------------------------*/

function SAEO_Roms() {
	const K1024 = 1048576;
	const K512 = 524288;
	const K256 = 262144;
	const K128 = 131072;
	const K64 = 65536;

	function romdata(a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p1,p2,p3,p4,p5,q,r) {
		this.num = -1;
		this.name = a;
		this.ver = b;
		this.rev = c;
		this.subver = d;
		this.subrev = e;
		this.model = f;
		this.size = g; //u32
		this.id = h;
		this.cpu = i;
		this.cloanto = j;
		this.type = k;
		this.group = l;
		this.title = m;
		this.partnumber = n;
		this.crc32 = o; //u32
		this.sha1 = [p1,p2,p3,p4,p5]; //u32
		this.configname = typeof q == "undefined" ? "" : q;
		this.defaultfilename = typeof r == "undefined" ? "" : r;
	}

	//const ALTROM(id,grp,num,size,flags,crc32,a,b,c,d,e) 		{ "X", 0, 0, 0, 0, 0, size, id, 0, 0, flags, (grp << 16) | num, 0, null, crc32, a, b, c, d, e },
	//const ALTROMPN(id,grp,num,size,flags,pn,crc32,a,b,c,d,e)	{ "X", 0, 0, 0, 0, 0, size, id, 0, 0, flags, (grp << 16) | num, 0, pn,   crc32, a, b, c, d, e },
	//																					a,  b, c, d, e, f, g,    h,  i, j, k,     l,                 m, n,    o,     p1,p2,p3,p4,p5, q,r

	function ALTROM(id,grp,num,size,flags,crc32,a,b,c,d,e) {
		return new romdata("X", 0, 0, 0, 0, 0, size, id, 0, 0, flags, (grp << 16) | num, "", "", crc32, a, b, c, d, e);
	}
	function ALTROMPN(id,grp,num,size,flags,pn,crc32,a,b,c,d,e) {
		return new romdata("X", 0, 0, 0, 0, 0, size, id, 0, 0, flags, (grp << 16) | num, "", pn, crc32, a, b, c, d, e);
	}

	const roms = [
		//new romdata("AROS KS ROM (built-in)", 0, 0, 0, 0, "AROS", K512 * 2, 66, 0, 0, SAEC_RomType_KICK, 0, "", "", 0xffffffff, 0, 0, 0, 0, 0, "AROS"),
		new romdata("AROS KS ROM (built-in)", 0, 0, 0, 0, "AROS", K512, 66, 0, 0, SAEC_RomType_KICK, 0, "", "", 0x3F4FCC0A, 0, 0, 0, 0, 0, "AROS"),
		new romdata("AROS extended ROM (built-in)", 0, 0, 0, 0, "AROS", K512, 66, 0, 0, 0, 0, "", "", 0xF2E52B07, 0, 0, 0, 0, 0, "AROS"),
		//new romdata("ROM Disabled", 0, 0, 0, 0, "NOROM", 0, 87, 0, 0, SAEC_RomType_NONE, 0, "", "", 0xffffffff, 0, 0, 0, 0, 0, "NOROM"),
		//new romdata("Enabled", 0, 0, 0, 0, "ENABLED", 0, 142, 0, 0, SAEC_RomType_NOT, 0, "", "", 0xffffffff, 0, 0, 0, 0, 0, "ENABLED"),

		new romdata("Cloanto Amiga Forever ROM key", 0, 0, 0, 0, "", 2069, 0, 0, 1, SAEC_RomType_KEY, 0, "", "", 0x869ae1b1, 0x801bbab3,0x2e3d3738,0x6dd1636d,0x4f1d6fa7,0xe21d5874),
		new romdata("Cloanto Amiga Forever 2006 ROM key", 0, 0, 0, 0, "", 750, 48, 0, 1, SAEC_RomType_KEY, 0, "", "", 0xb01c4b56, 0xbba8e5cd,0x118b8d92,0xafed5693,0x5eeb9770,0x2a662d8f),
		new romdata("Cloanto Amiga Forever 2010 ROM key", 0, 0, 0, 0, "", 1544, 73, 0, 1, SAEC_RomType_KEY, 0, "", "", 0x8c4dd05c, 0x05034f62,0x0b5bb7b2,0x86954ea9,0x164fdb90,0xfb2897a4),

		new romdata("KS ROM Velvet 23.93",					23, 93, 23, 93, "VELVET",				K128, 125, 0, 0, SAEC_RomType_KICK, 0, "", "", 0xadcb44c9, 0x7c36b2ba,0x298da3da,0xce60d0ba,0x8511d470,0x76a40d5c),
		ALTROMPN(125, 1, 1, 32768, SAEC_RomType_QUAD | SAEC_RomType_EVEN | SAEC_RomType_8BIT, "", 0x1d988ab8, 0xee3988a2,0xb2693334,0x0239d1d9,0xf50d4fb3,0xe0daf3bc),
		ALTROMPN(125, 1, 2, 32768, SAEC_RomType_QUAD | SAEC_RomType_ODD  | SAEC_RomType_8BIT, "", 0xe466b28f, 0x3e197d69,0xcffa3e1a,0x0c291d57,0xb53f7d1f,0xcb858cf7),
		ALTROMPN(125, 1, 3, 32768, SAEC_RomType_QUAD | SAEC_RomType_EVEN | SAEC_RomType_8BIT, "", 0x715988a9, 0x08c36600,0x3948c4c5,0x4216ef8c,0x17ebe16c,0xc91d3b7a),
		ALTROMPN(125, 1, 4, 32768, SAEC_RomType_QUAD | SAEC_RomType_ODD  | SAEC_RomType_8BIT, "", 0xc4dc7e6a, 0x66b231d0,0x8425c858,0xdfcd36d2,0xd38a0df8,0x518e06a4),
		new romdata("KS ROM v1.0 (A1000)(NTSC)",			1, 0, 1, 0, "A1000",						K256, 1, 0, 0, SAEC_RomType_KICK, 0, "", "", 0x299790ff, 0x00C15406,0xBEB4B8AB,0x1A16AA66,0xC05860E1,0xA7C1AD79),
		new romdata("KS ROM v1.1 (A1000)(NTSC)",			1, 1, 31, 34, "A1000",					K256, 2, 0, 0, SAEC_RomType_KICK, 0, "", "", 0xd060572a, 0x4192C505,0xD130F446,0xB2ADA6BD,0xC91DAE73,0x0ACAFB4C),
		new romdata("KS ROM v1.1 (A1000)(PAL)",			1, 1, 31, 34, "A1000",					K256, 3, 0, 0, SAEC_RomType_KICK, 0, "", "", 0xec86dae2, 0x16DF8B5F,0xD524C5A1,0xC7584B24,0x57AC15AF,0xF9E3AD6D),
		new romdata("KS ROM v1.2 (A1000)",					1, 2, 33, 166, "A1000",					K256, 4, 0, 0, SAEC_RomType_KICK, 0, "", "", 0x9ed783d0, 0x6A7BFB5D,0xBD6B8F17,0x9F03DA84,0xD8D95282,0x67B6273B),
		new romdata("KS ROM v1.2 (A500,A1000,A2000)",	1, 2, 33, 180, "A500|A1000|A2000",	K256, 5, 0, 0, SAEC_RomType_KICK, 0, "", "315093-01", 0xa6ce1636, 0x11F9E62C,0xF299F721,0x84835B7B,0x2A70A163,0x33FC0D88),
		new romdata("KS ROM v1.3 (A500,A1000,A2000)",	1, 3, 34, 5, "A500|A1000|A2000",	K256, 6, 0, 0, SAEC_RomType_KICK, 0, "", "315093-02", 0xc4f0f55f, 0x891E9A54,0x7772FE0C,0x6C19B610,0xBAF8BC4E,0xA7FCB785),
		new romdata("KS ROM v1.3 (A3000)(SK)",				1, 3, 34, 5, "A3000",						K256, 32, 0, 0, SAEC_RomType_KICK, 0, "", "", 0xe0f37258, 0xC39BD909,0x4D4E5F4E,0x28C1411F,0x30869504,0x06062E87),
		new romdata("KS ROM v1.4 (A3000)",					1, 4, 36, 16, "A3000",					K512, 59, 3, 0, SAEC_RomType_KICK, 0, "", "", 0xbc0ec13f, 0xF76316BF,0x36DFF14B,0x20FA349E,0xD02E4B11,0xDD932B07),
		ALTROMPN(59, 1, 1, K256, SAEC_RomType_EVEN, "390629-02", 0x58327536, 0xd1713d7f,0x31474a59,0x48e6d488,0xe3368606,0x1cf3d1e2),
		ALTROMPN(59, 1, 2, K256, SAEC_RomType_ODD , "390630-02", 0xfe2f7fb9, 0xc05c9c52,0xd014c66f,0x9019152b,0x3f2a2adc,0x2c678794),
		new romdata("KS ROM v2.04 (A500+)",					2, 4, 37, 175, "A500+",					K512, 7, 0, 0, SAEC_RomType_KICK, 0, "", "390979-01", 0xc3bdb240, 0xC5839F5C,0xB98A7A89,0x47065C3E,0xD2F14F5F,0x42E334A1),
		new romdata("KS ROM v2.05 (A600)",					2, 5, 37, 299, "A600",					K512, 8, 0, 0, SAEC_RomType_KICK, 0, "", "391388-01", 0x83028fb5, 0x87508DE8,0x34DC7EB4,0x7359CEDE,0x72D2E3C8,0xA2E5D8DB),
		new romdata("KS ROM v2.05 (A600HD)",				2, 5, 37, 300, "A600HD|A600",			K512, 9, 0, 0, SAEC_RomType_KICK, 0, "", "391304-01", 0x64466c2a, 0xF72D8914,0x8DAC39C6,0x96E30B10,0x859EBC85,0x9226637B),
		new romdata("KS ROM v2.05 (A600HD)",				2, 5, 37, 350, "A600HD|A600",			K512, 10, 0, 0, SAEC_RomType_KICK, 0, "", "391304-02", 0x43b0df7b, 0x02843C42,0x53BBD29A,0xBA535B0A,0xA3BD9A85,0x034ECDE4),
		new romdata("KS ROM v2.04 (A3000)",					2, 4, 37, 175, "A3000",					K512, 71, 8, 0, SAEC_RomType_KICK, 0, "", "", 0x234a7233, 0xd82ebb59,0xafc53540,0xddf2d718,0x7ecf239b,0x7ea91590),
		ALTROMPN(71, 1, 1, K256, SAEC_RomType_EVEN, "390629-03", 0xa245dbdf, 0x83bab8e9,0x5d378b55,0xb0c6ae65,0x61385a96,0xf638598f),
		ALTROMPN(71, 1, 2, K256, SAEC_RomType_ODD , "390630-03", 0x7db1332b, 0x48f14b31,0x279da675,0x7848df6f,0xeb531881,0x8f8f576c),
		new romdata("KS ROM v3.0 (A1200)",					3, 0, 39, 106, "A1200",					K512, 11, 0, 0, SAEC_RomType_KICK, 0, "", "", 0x6c9b07d2, 0x70033828,0x182FFFC7,0xED106E53,0x73A8B89D,0xDA76FAA5),
		ALTROMPN(11, 1, 1, K256, SAEC_RomType_EVEN, "391523-01", 0xc742a412, 0x999eb81c,0x65dfd07a,0x71ee1931,0x5d99c7eb,0x858ab186),
		ALTROMPN(11, 1, 2, K256, SAEC_RomType_ODD , "391524-01", 0xd55c6ec6, 0x3341108d,0x3a402882,0xb5ef9d3b,0x242cbf3c,0x8ab1a3e9),
		new romdata("KS ROM v3.0 (A4000)",					3, 0, 39, 106, "A4000",					K512, 12, 2 | 4, 0, SAEC_RomType_KICK, 0, "", "", 0x9e6ac152, 0xF0B4E9E2,0x9E12218C,0x2D5BD702,0x0E4E7852,0x97D91FD7),
		ALTROMPN(12, 1, 1, K256, SAEC_RomType_EVEN, "391513-02", 0x36f64dd0, 0x196e9f3f,0x9cad934e,0x181c07da,0x33083b1f,0x0a3c702f),
		ALTROMPN(12, 1, 2, K256, SAEC_RomType_ODD , "391514-02", 0x17266a55, 0x42fbed34,0x53d1f11c,0xcbde89a9,0x826f2d11,0x75cca5cc),
		new romdata("KS ROM v3.1 (A4000)",					3, 1, 40, 70, "A4000",					K512, 13, 2 | 4, 0, SAEC_RomType_KICK, 0, "", "", 0x2b4566f1, 0x81c631dd,0x096bbb31,0xd2af9029,0x9c76b774,0xdb74076c),
		ALTROM(13, 1, 1, K256, SAEC_RomType_EVEN, 0xf9cbecc9, 0x138d8cb4,0x3b8312fe,0x16d69070,0xde607469,0xb3d4078e),
		ALTROM(13, 1, 2, K256, SAEC_RomType_ODD , 0xf8248355, 0xc2379547,0x9fae3910,0xc185512c,0xa268b82f,0x1ae4fe05),
		new romdata("KS ROM v3.1 (A500,A600,A2000)",		3, 1, 40, 63, "A500|A600|A2000",	K512, 14, 0, 0, SAEC_RomType_KICK, 0, "", "", 0xfc24ae0d, 0x3B7F1493,0xB27E2128,0x30F989F2,0x6CA76C02,0x049F09CA),
		new romdata("KS ROM v3.1 (A1200)",					3, 1, 40, 68, "A1200",					K512, 15, 1, 0, SAEC_RomType_KICK, 0, "", "", 0x1483a091, 0xE2154572,0x3FE8374E,0x91342617,0x604F1B3D,0x703094F1),
		ALTROMPN(15, 1, 1, K256, SAEC_RomType_EVEN, "391773-01", 0x08dbf275,0xb8800f5f,0x90929810,0x9ea69690,0xb1b8523f,0xa22ddb37),
		ALTROMPN(15, 1, 2, K256, SAEC_RomType_ODD , "391774-01", 0x16c07bf8,0x90e331be,0x1970b0e5,0x3f53a9b0,0x390b51b5,0x9b3869c2),
		new romdata("KS ROM v3.1 (A3000)",					3, 1, 40, 68, "A3000",					K512, 61, 2, 0, SAEC_RomType_KICK, 0, "", "", 0xefb239cc, 0xF8E210D7,0x2B4C4853,0xE0C9B85D,0x223BA20E,0x3D1B36EE),
		ALTROM(61, 1, 1, K256, SAEC_RomType_EVEN, 0x286b9a0d, 0x6763a225,0x8ec493f7,0x408cf663,0x110dae9a,0x17803ad1),
		ALTROM(61, 1, 2, K256, SAEC_RomType_ODD , 0x0b8cde6a, 0x5f02e97b,0x48ebbba8,0x7d516a56,0xb0400c6f,0xc3434d8d),
		new romdata("KS ROM v3.1 (A4000)(Cloanto)",		3, 1, 40, 68, "A4000",					K512, 31, 2 | 4, 1, SAEC_RomType_KICK, 0, "", "", 0x43b6dd22, 0xC3C48116,0x0866E60D,0x085E436A,0x24DB3617,0xFF60B5F9),
		new romdata("KS ROM v3.1 (A4000)",					3, 1, 40, 68, "A4000",					K512, 16, 2 | 4, 0, SAEC_RomType_KICK, 0, "", "", 0xd6bae334, 0x5FE04842,0xD04A4897,0x20F0F4BB,0x0E469481,0x99406F49),
		ALTROM(16, 1, 1, K256, SAEC_RomType_EVEN, 0xb2af34f8, 0x24e52b5e,0xfc020495,0x17387ab7,0xb1a1475f,0xc540350e),
		ALTROM(16, 1, 2, K256, SAEC_RomType_ODD , 0xe65636a3, 0x313c7cbd,0xa5779e56,0xf19a41d3,0x4e760f51,0x7626d882),
		new romdata("KS ROM v3.1 (A4000T)",					3, 1, 40, 70, "A4000T",					K512, 17, 2 | 4, 0, SAEC_RomType_KICK, 0, "", "", 0x75932c3a, 0xB0EC8B84,0xD6768321,0xE01209F1,0x1E6248F2,0xF5281A21),
		ALTROMPN(17, 1, 1, K256, SAEC_RomType_EVEN, "391657-01", 0x0ca94f70, 0xb3806eda,0xcb3362fc,0x16a154ce,0x1eeec5bf,0x5bc24789),
		ALTROMPN(17, 1, 2, K256, SAEC_RomType_ODD , "391658-01", 0xdfe03120, 0xcd7a706c,0x431b04d8,0x7814d3a2,0xd8b39710,0x0cf44c0c),
		new romdata("KS ROM v3.X (A4000)(Cloanto)",		3, 10, 45, 57, "A4000",					K512, 46, 2 | 4, 1, SAEC_RomType_KICK, 0, "", "", 0x3ac99edc, 0x3cbfc9e1,0xfe396360,0x157bd161,0xde74fc90,0x1abee7ec),

		new romdata("KS ROM v3.1.4 (A4000T)(Hyperion)",	3, 1, 46, 143, "A4000T",				K512, 0, 2 | 4, 0, SAEC_RomType_KICK, 0, "", "", 0xd6d0ef3e, 0xcd73aefe,0x9cbfc258,0xe7966cd1,0x4a7b2f46,0x47c9ba45),

		new romdata("CD32 KS ROM v3.1",						3, 1, 40, 60, "CD32",					K512, 18, 1, 0, SAEC_RomType_KICKCD32, 0, "", "", 0x1e62d4a5, 0x3525BE88,0x87F79B59,0x29E017B4,0x2380A79E,0xDFEE542D),
		new romdata("CD32 extended ROM",						3, 1, 40, 60, "CD32",					K512, 19, 1, 0, SAEC_RomType_EXTCD32, 0, "", "", 0x87746be2, 0x5BEF3D62,0x8CE59CC0,0x2A66E6E4,0xAE0DA48F,0x60E78F7F),

		//plain CD32 rom
		new romdata("CD32 ROM (KS + extended)",			3, 1, 40, 60, "CD32",					K1024, 64, 1, 0, SAEC_RomType_KICKCD32 | SAEC_RomType_EXTCD32 | SAEC_RomType_CD32, 0, "", "", 0xf5d4f3c8, 0x9fa14825,0xc40a2475,0xa2eba5cf,0x325bd483,0xc447e7c1),
		//real CD32 rom dump 391640-03
		ALTROMPN(64, 1, 1, K1024, SAEC_RomType_CD32, "391640-03", 0xa4fbc94a, 0x816ce6c5,0x07787585,0x0c7d4345,0x2230a9ba,0x3a2902db),

		new romdata("CD32 Full Motion Video Cartridge ROM", 3, 1, 40, 30, "CD32FMV", K256, 23, 1, 0, SAEC_RomType_CD32CART, 0, "", "", 0xc35c37bf, 0x03ca81c7,0xa7b259cf,0x64bc9582,0x863eca0f,0x6529f435),
		new romdata("CD32 Full Motion Video Cartridge ROM", 3, 1, 40, 22, "CD32FMV", K256, 74, 1, 0, SAEC_RomType_CD32CART, 0, "", "391777-01", 0xf11158eb, 0x94e469a7,0x6030dcb2,0x99ebc752,0x0aaeef9d,0xb54284cf),

		new romdata("CDTV extended ROM v1.00", 1, 0, 1, 0, "CDTV", K256, 20, 0, 0, SAEC_RomType_EXTCDTV, 0, "", "", 0x42baa124, 0x7BA40FFA,0x17E500ED,0x9FED041F,0x3424BD81,0xD9C907BE),
		ALTROMPN(20, 1, 1, K128, SAEC_RomType_EVEN | SAEC_RomType_8BIT, "252606-01", 0x791cb14b, 0x277a1778,0x92449635,0x3ffe56be,0x68063d2a,0x334360e4),
		ALTROMPN(20, 1, 2, K128, SAEC_RomType_ODD  | SAEC_RomType_8BIT, "252607-01", 0xaccbbc2e, 0x41b06d16,0x79c6e693,0x3c3378b7,0x626025f7,0x641ebc5c),
		new romdata("CDTV extended ROM v2.07", 2, 7, 2, 7, "CDTV", K256, 22, 0, 0, SAEC_RomType_EXTCDTV, 0, "", "", 0xceae68d2, 0x5BC114BB,0xA29F60A6,0x14A31174,0x5B3E2464,0xBFA06846),
		ALTROM(22, 1, 1, K128, SAEC_RomType_EVEN | SAEC_RomType_8BIT, 0x36d73cb8, 0x9574e546,0x4b390697,0xf28f9a43,0x4e604e5e,0xf5e5490a),
		ALTROM(22, 1, 2, K128, SAEC_RomType_ODD  | SAEC_RomType_8BIT, 0x6e84dce7, 0x01a0679e,0x895a1a0f,0x559c7253,0xf539606b,0xd447b54f),
		new romdata("CDTV/A570 extended ROM v2.30", 2, 30, 2, 30, "CDTV", K256, 21, 0, 0, SAEC_RomType_EXTCDTV, 0, "", "391298-01", 0x30b54232, 0xED7E461D,0x1FFF3CDA,0x321631AE,0x42B80E3C,0xD4FA5EBB),
		ALTROM(21, 1, 1, K128, SAEC_RomType_EVEN | SAEC_RomType_8BIT, 0x48e4d74f, 0x54946054,0x2269e410,0x36018402,0xe1f6b855,0xfd89092b),
		ALTROM(21, 1, 2, K128, SAEC_RomType_ODD  | SAEC_RomType_8BIT, 0x8a54f362, 0x03df800f,0x032046fd,0x892f6e7e,0xec08b76d,0x33981e8c),
		new romdata("CDTV-CR extended ROM v3.32", 3, 32, 3, 32, "CDTVCR", K256, 107, 0, 0, SAEC_RomType_EXTCDTV, 0, "", "", 0x581a85cf, 0xd6b8d3f2,0x854eba9b,0x2d514579,0x9529e8b3,0x3b85e0b4),
		new romdata("CDTV-CR extended ROM v3.44", 3, 44, 3, 44, "CDTVCR", K256, 108, 0, 0, SAEC_RomType_EXTCDTV, 0, "", "", 0x0b7bd64f, 0x3b160c5a,0xbe79f10a,0xe6924332,0x8004bb9e,0x3162b648),

		new romdata("A1000 bootstrap ROM", 0, 0, 0, 0, "A1000", K64, 24, 0, 0, SAEC_RomType_KICK, 0, "", "", 0x0b1ad2d0, 0xBA93B8B8,0x5CA0D83A,0x68225CC3,0x3B95050D,0x72D2FDD7),
		ALTROM(24, 1, 1, 8192, 0, 0x62f11c04, 0xC87F9FAD,0xA4EE4E69,0xF3CCA0C3,0x6193BE82,0x2B9F5FE6),
		ALTROMPN(24, 2, 1, 4096, SAEC_RomType_EVEN | SAEC_RomType_8BIT, "252179-01", 0x42553bc4, 0x8855a97f,0x7a44e3f6,0x2d1c88d9,0x38fee1f4,0xc606af5b),
		ALTROMPN(24, 2, 2, 4096, SAEC_RomType_ODD  | SAEC_RomType_8BIT, "252180-01", 0x8e5b9a37, 0xd10f1564,0xb99f5ffe,0x108fa042,0x362e877f,0x569de2c3),

		/*new romdata("The Diagnostic 2.0 (Logica)", 2, 0, 2, 0, "LOGICA", K512, 72, 0, 0, SAEC_RomType_KICK | SAEC_RomType_SPECIALKICK, 0, "", "", 0x8484f426, 0xba10d161,0x66b2e2d6,0x177c979c,0x99edf846,0x2b21651e),

		new romdata("Picasso IV", 7, 4, 7, 4, "PIV", K128, 91, 0, 0, SAEC_RomType_PICASSOIV, 0, "", "", 0xa8133e7e, 0xcafafb91,0x6f16b9f3,0xec9b49aa,0x4b40eb4e,0xeceb5b5b),

		new romdata("A1060 BIOS 2.06", 2, 6, 2, 6, "A1060", 16384, 147, 0, 0, SAEC_RomType_A1060, 0, "", "380619-03", 0x185f2bbd, 0xeba74ad1,0x000a5351,0xa5d99179,0xbf75f831,0xac2d2402),
		new romdata("A2088 BIOS 3.4", 3, 4, 3, 4, "A2088", 16384, 148, 0, 0, SAEC_RomType_A2088, 0, "", "380788-04", 0x05552160, 0xd1defdee, 0x1c0eae41, 0x07d81e26, 0x74915cd2, 0x9d352f2e),
		new romdata("A2088 BIOS 3.5", 3, 5, 3, 5, "A2088", 16384, 158, 0, 0, SAEC_RomType_A2088, 0, "", "380788-04", 0xf8e1ad83, 0x45a2b7db,0x6e86fe80,0x5cfef63c,0x65c331a7,0x16a6e9e8),
		new romdata("A2088 BIOS 3.6.1", 3, 61, 3, 61, "A2088", 16384, 149, 0, 0, SAEC_RomType_A2088, 0, "", "380788-06", 0x5fd93e56, 0xc1b707a8,0xa62907d7,0x5299f10a,0xa60efd1f,0x44514b26),
		new romdata("A2088T BIOS 4.10", 4, 10, 4, 11, "A2088T", 32768, 150, 0, 0, SAEC_RomType_A2088T, 0, "", "390657-02", 0x20c5d1a9, 0x08e3fbb7,0x28dfc514,0x24083313,0x373ea7a5,0xa2c3e965),
		new romdata("A2088T BIOS 4.11", 4, 11, 4, 11, "A2088T", 32768, 151, 0, 0, SAEC_RomType_A2088T, 0, "", "390547-02", 0x074bc9b0, 0x2a3f56bc,0xe395f203,0x46eb68c4,0xade7153e,0x3e69f892),
		new romdata("A2088T BIOS 4.12", 4, 12, 4, 12, "A2088T", 32768, 152, 0, 0, SAEC_RomType_A2088T, 0, "", "390547-03", 0x92447176, 0x582fa254,0x73aa2679,0xefcd41a5,0xbdadf1a2,0x6a87a75f),
		new romdata("A2286 BIOS 3.6", 3, 6, 3, 6, "A2286", 32768, 153, 0, 0, SAEC_RomType_A2286, 0, "", "", 0x63d75f70, 0x9f5d6c78,0x656d2fe7,0x36608644,0x771b6d30,0x31083264),
		//ALTROMPN(153, 1, 1, 16384, SAEC_RomType_ODD  | SAEC_RomType_8BIT, "380682-03", 0xb3f76402, 0xef9ba5f2, 0x2714ad6d, 0xfa5e0aef, 0x2d09ce83, 0x578ee26d)
		//ALTROMPN(153, 1, 2, 16384, SAEC_RomType_EVEN | SAEC_RomType_8BIT, "380683-03", 0xab053693, 0x75229d80, 0x443fad78, 0xa298d04b, 0x37c8e6c3, 0x2c1b6df0)
		new romdata("A2286 BIOS 4.2", 4, 2, 4, 2, "A2286", 32768, 154, 0, 0, SAEC_RomType_A2286, 0, "", "", 0xd572e205, 0x74fdf0f8,0x325fbc41,0x2b98c72d,0xf5095804,0x831c46b5),
		//ALTROMPN(154, 1, 1, 16384, SAEC_RomType_ODD  | SAEC_RomType_8BIT, "380682-04", 0xc23dcd55, 0x38dc24b7, 0x14427b15, 0xd5214cc9, 0xb9be0de7, 0x20bd6a34)
		//ALTROMPN(154, 1, 2, 16384, SAEC_RomType_EVEN | SAEC_RomType_8BIT, "380683-04", 0xdad80c0b, 0x12fe2916, 0x64f8c412, 0x3877a24e, 0x05837091, 0x44d8acd0)
		new romdata("A2386SX BIOS 1.0", 1, 0, 1, 0, "A2386SX", K64, 155, 0, 0, SAEC_RomType_A2386, 0, "", "", 0x37003e0c, 0x2e127e9c,0x8581d30c,0x2e46404b,0x21608e3c,0xe935fa27),

		new romdata("Arcadia OnePlay 2.11", 0, 0, 0, 0, "ARCADIA", 0, 49, 0, 0, SAEC_RomType_ARCADIABIOS, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia TenPlay 2.11", 0, 0, 0, 0, "ARCADIA", 0, 50, 0, 0, SAEC_RomType_ARCADIABIOS, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia TenPlay 2.20", 0, 0, 0, 0, "ARCADIA", 0, 75, 0, 0, SAEC_RomType_ARCADIABIOS, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia OnePlay 3.00", 0, 0, 0, 0, "ARCADIA", 0, 51, 0, 0, SAEC_RomType_ARCADIABIOS, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia TenPlay 3.11", 0, 0, 0, 0, "ARCADIA", 0, 76, 0, 0, SAEC_RomType_ARCADIABIOS, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia TenPlay 4.00", 0, 0, 0, 0, "ARCADIA", 0, 77, 0, 0, SAEC_RomType_ARCADIABIOS, 0, "", "", 0, 0,0,0,0,0),

		new romdata("Arcadia SportTime Table Hockey v2.1",			0, 0, 0, 0, "ARCADIA", 0, 33, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia SportTime Bowling v2.1",				0, 0, 0, 0, "ARCADIA", 0, 34, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia World Darts v2.1",						0, 0, 0, 0, "ARCADIA", 0, 35, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Magic Johnson's Fast Break v2.8",	0, 0, 0, 0, "ARCADIA", 0, 36, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Leader Board Golf v2.4",				0, 0, 0, 0, "ARCADIA", 0, 37, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Leader Board Golf",						0, 0, 0, 0, "ARCADIA", 0, 38, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Ninja Mission v2.5",						0, 0, 0, 0, "ARCADIA", 0, 39, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Road Wars v2.3",							0, 0, 0, 0, "ARCADIA", 0, 40, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Sidewinder v2.1",							0, 0, 0, 0, "ARCADIA", 0, 41, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Spot v2.0",									0, 0, 0, 0, "ARCADIA", 0, 42, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Space Ranger v2.0",						0, 0, 0, 0, "ARCADIA", 0, 43, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Xenon v2.3",								0, 0, 0, 0, "ARCADIA", 0, 44, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia World Trophy Soccer v3.0",				0, 0, 0, 0, "ARCADIA", 0, 45, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Blastaball v2.1",							0, 0, 0, 0, "ARCADIA", 0, 78, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Delta Command",							0, 0, 0, 0, "ARCADIA", 0, 79, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Pharaohs Match",							0, 0, 0, 0, "ARCADIA", 0, 80, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia SportTime Table Hockey",				0, 0, 0, 0, "ARCADIA", 0, 81, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia World Darts (bad)",						0, 0, 0, 0, "ARCADIA", 0, 82, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Magic Johnson's Fast Break v2.7",	0, 0, 0, 0, "ARCADIA", 0, 83, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Ninja Mission",							0, 0, 0, 0, "ARCADIA", 0, 84, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Sidewinder",								0, 0, 0, 0, "ARCADIA", 0, 85, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Leader Board Golf v2.5",				0, 0, 0, 0, "ARCADIA", 0, 86, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),
		new romdata("Arcadia Aaargh",										0, 0, 0, 0, "ARCADIA", 0, 88, 0, 0, SAEC_RomType_ARCADIAGAME, 0, "", "", 0, 0,0,0,0,0),*/

		//OWN
		//68000
		new romdata("Macintosh 128K",					0,0, 0,0, "128K",		K64, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x6D0C8A28, 0,0,0,0,0), //9D86C883AA09F7EF5F086D9E32330EF85F1BC93B
		new romdata("Macintosh 512K",					0,0, 0,0, "512K",		K64, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0xCF759E0D, 0,0,0,0,0), //5B1CED181B74CECD3834C49C2A4AA1D7FFE944D7
		new romdata("Macintosh Plus (version 1)", 0,0, 0,0, "Plus",		K128, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x4FA5B399, 0xE0DA7165,0xB92DEE90,0xD8B15224,0x29C03372,0x9FA73FD2),
		new romdata("Macintosh Plus (version 2)", 0,0, 0,0, "Plus",		K128, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x7CACD18F, 0x73BF2EB2,0x15646E10,0x8DAA0CDD,0x874E6C84,0x3C8CE421),
		new romdata("Macintosh Plus (version 3)", 0,0, 0,0, "Plus",		K128, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0xB2102E8E, 0x7D2F808A,0x045AA3A1,0xB242764F,0x0E2C7D13,0xE288BF1F),
		new romdata("Macintosh SE",					0,0, 0,0, "SE",		K256, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x0F7FF80C, 0,0,0,0,0), //58532B7D0D49659FD5228AC334A1B094F0241968
		new romdata("Macintosh SE (FDHD)",			0,0, 0,0, "SE",		K256, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0xF530CB10, 0,0,0,0,0), //D3670A90273D12E53D86D1228C068CB660B8C9D1
		//new romdata("Macintosh Classic (with XO ROMDisk)",	0,0, 0,0, "Classic",	K512, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x510D7D38, 0,0,0,0,0), //CCD10904DDC0FB6A1D216B2E9EFFD5EC6CF5A83D
		new romdata("Macintosh Classic",				0,0, 0,0, "Classic",	K256, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0xB14DDCDE, 0,0,0,0,0), //F710E73E8E0F99D9D0E9E79E71F67A6C3648BF06
		//68HC000 16mhz
		new romdata("Macintosh Portable",			0,0, 0,0, "Portable",K256, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x497348F8, 0,0,0,0,0), //79B468B33FC53F11E87E2E4B195AAC981BF0C0A6
		new romdata("PowerBook 100",					0,0, 0,0, "100",		K256, 200, 0, 0, SAEC_RomType_AMAX, 0, "", "", 0x29AC7EE9, 0,0,0,0,0), //7F3ACF40B1F63612DE2314A2E9FCFEAFCA0711FC
		//68020 16mhz
		new romdata("Macintosh II (version 1)",	0,0, 0,0, "II",		K256, 200, 2, 0, SAEC_RomType_AMAX, 0, "", "", 0x8C8B9D03, 0,0,0,0,0), //5C264FE976F1E8495D364947C932A5E8309B4300
		new romdata("Macintosh II (version 2)",	0,0, 0,0, "II",		K256, 200, 2, 0, SAEC_RomType_AMAX, 0, "", "", 0x4DF6D054, 0,0,0,0,0), //DB6B504744281369794E26BA71A6E385CF6227FA
		new romdata("Macintosh LC",					0,0, 0,0, "LC",		K512, 200, 2, 0, SAEC_RomType_AMAX, 0, "", "", 0x71681726, 0,0,0,0,0), //6BEF5853AE736F3F06C2B4E79772F65910C3B7D4
	];
	for (var vi = 0; vi < roms.length; vi++)
		roms[vi].num = vi;

	/*-----------------------------------------------------------------------*/

	this.getromname = function(rd) {
		var name = "";
		if (rd === null)
			return name;

		while (rd.group) rd = roms[rd.num - 1];
		name += rd.name;
		if ((rd.subrev || rd.subver) && rd.subver != rd.ver)
			name += sprintf(" rev %d.%d", rd.subver, rd.subrev);
		if (rd.size > 0)
			name += sprintf(" (%dK)", (rd.size + 1023) >> 10);
		if (rd.partnumber && rd.partnumber.length > 0)
			name += sprintf(" [%s]", rd.partnumber);

		return name;
	}

	/*-----------------------------------------------------------------------*/

	function notcrc32(crc32) {
		return crc32 == 0xffffffff || crc32 == 0x00000000;
	}
	this.getromdatabycrc = function(crc32, allowgroup) {
		if (typeof allowgroup == "undefined") allowgroup = false;
		var i, l = roms.length;
		for (i = 0; i < l; i++) {
			if (roms[i].group == 0 && crc32 == roms[i].crc32 && !notcrc32(crc32))
				return roms[i];
		}
		if (allowgroup) {
			for (i = 0; i < l; i++) {
				if (roms[i].group != 0 && crc32 == roms[i].crc32 && !notcrc32(crc32))
					return roms[i];
			}
		}
		return null;
	}
	/*this.getromdatabycrc = function(crc32) {
		return getromdatabycrc(crc32, false);
	}*/


	/*const SHA1_SIZE = 20;

	function cmpsha1(sha1, rd) {
		for (var i = 0; i < SHA1_SIZE; i += 4) {
			if (((sha1[i] << 24) | (sha1[i + 1] << 16) | (sha1[i + 2] << 8) | (sha1[i + 3] << 0)) >>> 0 != rd.sha1[i >> 2])
				return -1;
		}
		return 0;
	}
	function checkromdata(sha1, size, mask) {
		for (var i = 0; i < roms.length; i++) {
			if (roms[i].size >= size) {
				if (roms[i].type & mask) {
					if (!cmpsha1(sha1, roms[i]))
						return roms[i];
				}
			}
		}
		return null;
	}*/
	function checkromdata(crc32, size, mask) {
		for (var i = 0; i < roms.length; i++) {
			if (!notcrc32(roms[i].crc32) && roms[i].size >= size) {
				if (roms[i].type & mask) {
					if (crc32 == roms[i].crc32)
						return roms[i];
				}
			}
		}
		return null;
	}

	this.getromdatabydata = function(rom, size) {
		if (size > 11 && SAEF_CompareArray(rom, SAEF_String2Array("AMIROMTYPE1"), 11) == 0) {
			var tmpbuf = new Uint8Array(size);
			var tmpsize = size - 11;
			tmpbuf.set(rom.subarray(11)); //memcpy (tmpbuf, rom + 11, tmpsize);
			if (this.decode_rom(tmpbuf,0, tmpsize, 1, tmpsize) != 0)
				return null;
			rom = tmpbuf;
			size = tmpsize;
		}
		/*#if 0
		if (size > 0x6c + K512 && SAEF_CompareArray(rom, SAEF_String2Array("AMIG"), 4) == 0) {
			var tmpbuf = new Uint8Array(size);
			var tmpsize = size - 0x6c;
			tmpbuf.set(rom.subarray(0x6c)); //memcpy (tmpbuf, rom + 0x6c, tmpsize);
			this.decode_rom(tmpbuf,0, tmpsize, 2, tmpsize);
			rom = tmpbuf;
			size = tmpsize;
		}
		#endif*/

		//var sha1[SHA1_SIZE]; get_sha1(rom, size, sha1); var ret = checkromdata(sha1, size, 0xffffffff);*/
		var crc32 = SAEF_crc32(rom,0, size);
		var ret = checkromdata(crc32, size, 0xffffffff);
		if (ret === null) {
			//get_sha1(rom, size >> 1, sha1); ret = checkromdata(sha1, size >> 1, 0xffffffff);
			crc32 = SAEF_crc32(rom,0, size >> 1);
			ret = checkromdata(crc32, size >> 1, 0xffffffff);
			/*if (ret === null) {
				var tmp = new Uint8Array(4);
				//ignore AR2/3 IO-port range until we have full dump
				tmp.set(rom.subarray(0, 4)); //memcpy (tmp, rom, 4);
				SAEF_memset(rom,0, 0, 4); //memset (rom, 0, 4);
				//get_sha1(rom, size, sha1); ret = checkromdata(sha1, size, SAEC_RomType_AR2);
				crc32 = SAEF_crc32(rom,0, size);
				ret = checkromdata(crc32, size, SAEC_RomType_AR2);
				rom.set(tmp); //memcpy (rom, tmp, 4);
			}*/
		}
		return ret;
	}

	/*-----------------------------------------------------------------------*/

	this.kickstart_fix_checksum = function(mem,memo, size) {
		var cksum = 0, prevck = 0;
		var i, ch = size == K512 ? 0x7ffe8 : (size == K256 ? 0x3ffe8 : 0x3e);

		mem[memo + ch    ] = 0;
		mem[memo + ch + 1] = 0;
		mem[memo + ch + 2] = 0;
		mem[memo + ch + 3] = 0;
		for (i = 0; i < size; i += 4) {
			var data = ((mem[memo + i] << 24) | (mem[memo + i + 1] << 16) | (mem[memo + i + 2] << 8) | mem[memo + i + 3]) >>> 0;
			cksum += data; if (cksum > 0xffffffff) cksum -= 0x100000000;
			if (cksum < prevck) {
				cksum++; if (cksum > 0xffffffff) cksum -= 0x100000000;
			}
			prevck = cksum;
		}
		cksum = (cksum ^ 0xffffffff) >>> 0;
		mem[memo + ch    ] = cksum >>> 24;
		mem[memo + ch + 1] = (cksum >>> 16) & 0xff;
		mem[memo + ch + 2] = (cksum >>> 8) & 0xff;
		mem[memo + ch + 3] = cksum & 0xff;

		SAEF_log("roms.kickstart_fix_checksum() %08X", cksum);
	}

	function kickstart_calc_checksum(mem,memo, size) {
		var cksum = 0, prevck = 0;
		for (var i = 0; i < size; i += 4) {
			var data = ((mem[memo + i] << 24) | (mem[memo + i + 1] << 16) | (mem[memo + i + 2] << 8) | mem[memo + i + 3]) >>> 0;
			cksum += data; if (cksum > 0xffffffff) cksum -= 0x100000000;
			if (cksum < prevck) {
				cksum++; if (cksum > 0xffffffff) cksum -= 0x100000000;
			}
			prevck = cksum;
		}
		return cksum;
	}

	this.kickstart_verify_checksum = function(mem,memo, size) {
		var cksum = kickstart_calc_checksum(mem,memo, size);
		SAEF_log("roms.kickstart_verify_checksum() %08X", cksum);
		return cksum == 0xffffffff;
	}

	/*-----------------------------------------------------------------------*/

	function macintosh_calc_checksum(mem,memo, size) { //OWN
		var cksum = 0;

		if (size == 0x400000) //Special case: 4MiB ROMs only checksum the first 3 MiB.
			size -= 0x100000;

		for (var i = 4; i < size; i += 2) {
			var data = (mem[memo + i] << 8) | mem[memo + i + 1];
			cksum += data; if (cksum > 0xffffffff) cksum -= 0x100000000;
		}
		return cksum;
	}

	/*-----------------------------------------------------------------------*/

	function decode_cloanto_rom(mem,memo, size, real_size) {
		var rk = SAEV_config.memory.romKey;

		if (rk.name.length && rk.data.length) {
			var keydata = rk.data;
			var keysize = rk.data.length;
			var cnt, t;

			for (t = cnt = 0; cnt < size; cnt++, t = (t + 1) % keysize)  {
				mem[memo + cnt] ^= keydata.charCodeAt(t);
				if (real_size == cnt + 1)
					t = keysize - 1;
			}
			if ((mem[memo + 2] == 0x4e && mem[memo + 3] == 0xf9) || (mem[memo] == 0x11 && (mem[memo + 1] == 0x11 || mem[memo + 1] == 0x14))) {
				//SAEV_Memory_cloantoRom = true;
				return 0;
			}

			/*
			//uae_u8 sha1[SHA1_SIZE]; get_sha1(mem, size, sha1); var rd = checkromdata(sha1, size, 0xffffffff);
			var crc32 = SAEF_crc32(mem,memo, size);
			var rd = checkromdata(crc32, size, 0xffffffff);
			if (rd !== null) {
				//if (rd.cloanto) SAEV_Memory_cloantoRom = true;
				//SAEF_warn("roms.decode_cloanto_rom() invalid/wrong rom-key");
				return -1;
			}*/
			return -1;
		}
		return -2;
	}
	function decode_rekick_rom(mem,memo, size, real_size) {
		var d1 = 0xdeadfeed, d0;

		for (var i = memo; i < memo + (size >> 3); i++) {
			d0 = (((mem[i * 8 + 0] << 24) | (mem[i * 8 + 1] << 16) | (mem[i * 8 + 2] << 8) | mem[i * 8 + 3])) >>> 0;
			d1 = (d1 ^ d0) >>> 0;
			mem[i * 8 + 0] = d1 >>> 24;
			mem[i * 8 + 1] = (d1 >>> 16) & 0xff;
			mem[i * 8 + 2] = (d1 >>> 8) & 0xff;
			mem[i * 8 + 3] = d1 & 0xff;
			d1 = (((mem[i * 8 + 4] << 24) | (mem[i * 8 + 5] << 16) | (mem[i * 8 + 6] << 8) | mem[i * 8 + 7])) >>> 0;
			d0 = (d0 ^ d1) >>> 0;
			mem[i * 8 + 4] = d0 >>> 24;
			mem[i * 8 + 5] = (d0 >>> 16) & 0xff;
			mem[i * 8 + 6] = (d0 >>> 8) & 0xff;
			mem[i * 8 + 7] = d0 & 0xff;
		}
		return 0;
	}
	this.decode_rom = function(mem,memo, size, mode, real_size) {
		if (mode == 1)
			return decode_cloanto_rom(mem,memo, size, real_size);
		else if (mode == 2)
			return decode_rekick_rom(mem,memo, size, real_size);

		return -3;
	}

	/*-----------------------------------------------------------------------*/

	function replaceAll(str, search, replacement) {
		return str.split(search).join(replacement);
	}

	this.examine = function(ri, file) {
		var data = SAEF_String2Array(file.data);
		var size = file.size;

		var cloanto = false;
		if (size > 11 && SAEF_CompareArray(data, SAEF_String2Array("AMIROMTYPE1"), 11) == 0) {
			var tmpdata = new Uint8Array(size);
			var tmpsize = size - 11;
			tmpdata.set(data.subarray(11)); //memcpy (tmpdata, data + 11, tmpsize);
			var err = this.decode_rom(tmpdata,0, tmpsize, 1, tmpsize);
			if (err == -1)
				return SAEE_Memory_RomDecode;
			if (err == -2)
				return SAEE_Memory_RomKey;

			data = tmpdata;
			size = tmpsize;
			cloanto = true;
		}

		var crc32 = file.crc32;
		if (crc32 === false || cloanto) {
			crc32 = SAEF_crc32(data,0, size);
			if (!cloanto)
				 file.crc32 = crc32;
		}

		var rd = checkromdata(crc32, size, 0xffffffff);
		if (rd === null)
			return SAEE_Memory_RomUnknown;

		while (rd.group)
			rd = roms[rd.num - 1];

		ri.name = rd.name;

		if (rd.type & SAEC_RomType_AMAX) {
			var ver = data.subarray(0x08, 0x08 + 2);
			var rev = data.subarray(0x12, 0x12 + 2);
			var sub = data.subarray(0x4c, 0x4c + 2);
			ri.ver = (ver[0] << 8) | ver[1];
			ri.rev = (rev[0] << 8) | rev[1];
			ri.subVer = (sub[0] << 8) | sub[1];
			ri.subRev = 0;
		} else {
			ri.ver = rd.ver;
			ri.rev = rd.rev;
			ri.subVer = rd.subver;
			ri.subRev = rd.subrev;
		}
		ri.models = replaceAll(rd.model, "|", ", ");
		ri.size = rd.size;
		//rd.id
		if (rd.cpu & 8) { //v2.04 (A3000)
			ri.cpu = 68030;
		} else if ((rd.cpu & 3) == 3) {
			ri.cpu = 68030;
			ri.cpuExact = true;
		} else if ((rd.cpu & 3) == 2) {
			ri.cpu = 68020;
		} else if ((rd.cpu & 3) == 1) {
			ri.cpu = 68020; //EC
			ri.addressSpace24 = true;
		} else {
			ri.cpu = 68000;
			ri.addressSpace24 = true;
		}
		ri.cloanto = cloanto; //rd.cloanto;
		ri.type = rd.type;

		//rd.title
		ri.partNumber = rd.partnumber;
		ri.crc32 = rd.crc32;
		//rd.sha1

		if (rd.type & (SAEC_RomType_ALL_KICK | SAEC_RomType_ALL_EXT)) {
			ri.checksum = kickstart_calc_checksum(data,0, size);
			ri.checksumValid = ri.checksum == 0xffffffff;
		}
		else if (rd.type & SAEC_RomType_AMAX) {
			var chk = data.subarray(0, 4);
			ri.checksum = macintosh_calc_checksum(data,0, size);
			ri.checksumValid = ri.checksum == ((chk[0] << 24) | (chk[1] << 16) | (chk[2] << 8) | chk[3]) >>> 0;
		}
		else {
			ri.checksum = false;
			ri.checksumValid = false;
		}
		return SAEE_None;
	}
}



























