/**************************************************************************
* SAE - Scripted Amiga Emulator
*
* https://github.com/naTmeg/ScriptedAmigaEmulator
*
* ©2012 Rupert Hausberger
* Commercial use is prohibited.
*
**************************************************************************/

const SAEV_Version = 0;
const SAEV_Revision = 7;
const SAEV_Revision_Sub = 0;

/*-----------------------------------------------------------------------*/

const SAEV_Null = null;

const SAEV_True = true;
const SAEV_False = false;

/*-----------------------------------------------------------------------*/
/* cpu */

const SAEV_Config_CPU_Speed_Maximum = -1;
const SAEV_Config_CPU_Speed_Original = 0;

/*-----------------------------------------------------------------------*/
/* chipset */

const SAEV_Config_Chipset_Type_OCS = 1;
const SAEV_Config_Chipset_Type_ECS = 2;

const SAEV_Config_Chipset_ColLevel_None = 0;
const SAEV_Config_Chipset_ColLevel_Sprite_Sprite = 1;
const SAEV_Config_Chipset_ColLevel_Sprite_Playfield = 2;

/*-----------------------------------------------------------------------*/
/* ram */

const SAEV_Config_RAM_Chip_Size_256K = 1;
const SAEV_Config_RAM_Chip_Size_512K = 2;
const SAEV_Config_RAM_Chip_Size_1M = 3;
const SAEV_Config_RAM_Chip_Size_2M = 4;

const SAEV_Config_RAM_Slow_Size_None = 0;
const SAEV_Config_RAM_Slow_Size_256K = 1;
const SAEV_Config_RAM_Slow_Size_512K = 2;
const SAEV_Config_RAM_Slow_Size_1M = 3;
const SAEV_Config_RAM_Slow_Size_1536K = 4;

const SAEV_Config_RAM_Fast_Size_None = 0;
const SAEV_Config_RAM_Fast_Size_512K = 1;
const SAEV_Config_RAM_Fast_Size_1M = 2;
const SAEV_Config_RAM_Fast_Size_2M = 3;
const SAEV_Config_RAM_Fast_Size_4M = 4;
const SAEV_Config_RAM_Fast_Size_8M = 5;

/*-----------------------------------------------------------------------*/
/* rom, ext */

const SAEV_Config_ROM_Size_None = 0;
const SAEV_Config_ROM_Size_256K = 1;
const SAEV_Config_ROM_Size_512K = 2;

const SAEV_Config_EXT_Size_None = 0;
const SAEV_Config_EXT_Size_256K = 1;
const SAEV_Config_EXT_Size_512K = 2;

const SAEV_Config_EXT_Addr_A0 = 1;
const SAEV_Config_EXT_Addr_E0 = 2;
const SAEV_Config_EXT_Addr_F0 = 3;

/*-----------------------------------------------------------------------*/
/* disk */

const SAEV_Config_Floppy_Type_None = 0;
const SAEV_Config_Floppy_Type_35_DD = 1;
const SAEV_Config_Floppy_Type_35_HD = 2;
const SAEV_Config_Floppy_Type_525_SD = 3;

const SAEV_Config_Floppy_Speed_Turbo = 0;
const SAEV_Config_Floppy_Speed_Original = 100;

/*-----------------------------------------------------------------------*/
/* audio */

const SAEV_Config_Audio_Mode_Emul = 0;
const SAEV_Config_Audio_Mode_Play = 1;
const SAEV_Config_Audio_Mode_Play_Best = 2;

const SAEV_Config_Audio_Channels_Mono = 1;
const SAEV_Config_Audio_Channels_Stereo = 2;

const SAEV_Config_Audio_Rate_11025 = 1;
const SAEV_Config_Audio_Rate_22050 = 2;
const SAEV_Config_Audio_Rate_44100 = 3;
const SAEV_Config_Audio_Rate_48000 = 4;

/*-----------------------------------------------------------------------*/
/* input */

const SAEV_Config_Ports_Type_None = 0;
const SAEV_Config_Ports_Type_Mouse = 1;
const SAEV_Config_Ports_Type_Joy0 = 2;
const SAEV_Config_Ports_Type_Joy1 = 3;

const SAEV_Config_Ports_Move_None = 0;
const SAEV_Config_Ports_Move_Arrows = 1;
const SAEV_Config_Ports_Move_Numpad = 2;
const SAEV_Config_Ports_Move_WASD = 3;

const SAEV_Config_Ports_Fire_None = 0;

/*-----------------------------------------------------------------------*/
/* rtc */

const SAEV_Config_RTC_Type_None = 0;
const SAEV_Config_RTC_Type_MSM6242B = 1;
const SAEV_Config_RTC_Type_RF5C01A = 2;

/*-----------------------------------------------------------------------*/
/* erros */

const SAEE_None = 0;

const SAEE_CPU_Internal = 1;
const SAEE_CPU_68020_Required = 2;

const SAEE_Disk_File_Too_Big = 3;

const SAEE_Video_Shader_Error = 4;
const SAEE_Video_ID_Not_Found = 5;
const SAEE_Video_Canvas_Not_Supported = 6;
const SAEE_Video_WebGL_Not_Avail = 7;

const SAEE_Audio_WebAudio_Not_Avail = 8;

/*-----------------------------------------------------------------------*/
/* methods */

const SAEM_Init = 1;
const SAEM_Start = 2;
const SAEM_Stop = 3;
const SAEM_Pause = 4;
const SAEM_Reset = 5;
const SAEM_Insert = 6;
const SAEM_Eject = 7;

/*-----------------------------------------------------------------------*/
/*-----------------------------------------------------------------------*/
/* debug */

var BUG = null;

/*-----------------------------------------------------------------------*/
/* amiga */

var AMIGA = null;

const CMD_STOP  = 0;
const CMD_CYCLE = 1;
const CMD_PAUSE = 2;
const CMD_IDLE  = 3;

/*-----------------------------------------------------------------------*/
/* events */

const EV_CIA     = 0;
const EV_AUDIO   = 1;
const EV_MISC    = 2;
const EV_HSYNC   = 3;
const EV_MAX     = 4;
//const EV_COPPER  = ;
//const EV_BLITTER = ;
//const EV_RENDER  = ;

const EV2_BLITTER = 0;
const EV2_DISK    = 1;
const EV2_MISC    = 2;
const EV2_MAX     = 12;

const CYCLE_UNIT = 512;
const CYCLE_UNIT_INV = 1.0 / CYCLE_UNIT; /* mul is always faster than div */

const CYCLE_MAX = 0xffffffff * CYCLE_UNIT;

/*-----------------------------------------------------------------------*/
/* cia */

const CIA_A = 1;
const CIA_B = 2;

const ECLOCK_DATA_CYCLE = 4;
const ECLOCK_WAIT_CYCLE = 6;

const DIV10 = ((ECLOCK_DATA_CYCLE + ECLOCK_WAIT_CYCLE) * CYCLE_UNIT) >> 1;

const CIA_RETHINK_DELAY = (CYCLE_UNIT << 1) + (CYCLE_UNIT >> 1); 

/*-----------------------------------------------------------------------*/
/* config */

//OCS
const AGNUS_8361 = 1; /* Amiga 1000 NTSC */
const AGNUS_8367 = 2; /* Amiga 1000 PAL */ 
const AGNUS_8370 = 3; /* OCS NTSC */       
const AGNUS_8371 = 4; /* OCS PAL */        
//ECS                       
const AGNUS_8372 = 5; /* ECS */            
//AGA
const AGNUS_8374 = 6; /* AGA */

const DENISE_8362 = 1; /* OCS */
const DENISE_8373 = 2; /* ECS */

const PAULA_8364 = 1;

/*-----------------------------------------------------------------------*/
/* cpu */

const SPCFLAG_STOP = 2;
const SPCFLAG_COPPER = 4;
const SPCFLAG_INT = 8;
//const SPCFLAG_BRK = 16;
const SPCFLAG_TRACE = 64;
const SPCFLAG_DOTRACE = 128;
const SPCFLAG_DOINT = 256; 
const SPCFLAG_BLTNASTY = 512;
//const SPCFLAG_EXEC = 1024;
//const SPCFLAG_ACTION_REPLAY = 2048;
//const SPCFLAG_TRAP = 4096;

/*-----------------------------------------------------------------------*/
/* amiga */

const INTF_TBE		= 1 << 0;
const INTF_DSKBLK	= 1 << 1;
const INTF_PORTS	= 1 << 3;
const INTF_COPER	= 1 << 4;
const INTF_VERTB	= 1 << 5;
const INTF_BLIT	= 1 << 6;
const INTF_AUD0	= 1 << 7;
const INTF_AUD1	= 1 << 8;
const INTF_AUD2	= 1 << 9;
const INTF_AUD3	= 1 << 10;
const INTF_RBF		= 1 << 11;
const INTF_DSKSYN	= 1 << 12;
const INTF_EXTER	= 1 << 13;
const INTF_INTEN	= 1 << 14;
const INTF_SETCLR	= 1 << 15;

const INT_DSKBLK	= INTF_SETCLR | INTF_DSKBLK;
const INT_VERTB	= INTF_SETCLR | INTF_VERTB;
const INT_BLIT		= INTF_SETCLR | INTF_BLIT;
const INT_DSKSYN	= INTF_SETCLR | INTF_DSKSYN;

const DMAF_AUD0EN	= 1 << 0;
const DMAF_AUD1EN	= 1 << 1;
const DMAF_AUD2EN	= 1 << 2;
const DMAF_AUD3EN	= 1 << 3;
const DMAF_DSKEN	= 1 << 4;
const DMAF_SPREN	= 1 << 5;
const DMAF_BLTEN	= 1 << 6;
const DMAF_COPEN	= 1 << 7;
const DMAF_BPLEN	= 1 << 8;
const DMAF_DMAEN	= 1 << 9;
const DMAF_BLTPRI	= 1 << 10;
const DMAF_BZERO	= 1 << 13;
const DMAF_BBUSY	= 1 << 14;
const DMAF_SETCLR	= 1 << 15;

const INT_PROCESSING_DELAY = 3 * CYCLE_UNIT;

/*-----------------------------------------------------------------------*/
/* copper */

/*const COP_STOP = 0;
const COP_READ = 1;
const COP_MOVE = 2;
const COP_WAIT = 3;
const COP_SKIP = 4;*/

/*-----------------------------------------------------------------------*/
/* blitter  */

/*const BLT_STOP = 0;
const BLT_INIT = 1;
const BLT_READ = 2;
const BLT_WORK = 3;
const BLT_WRITE = 4;
const BLT_NEXT = 5;*/

const BLT_done = 0;
const BLT_init = 1;
const BLT_read = 2;
const BLT_work = 3;
const BLT_write = 4;
const BLT_next = 5;

/*-----------------------------------------------------------------------*/
/* video  */

const VIDEO_WIDTH = 720; /* == 360*2 */
const VIDEO_HEIGHT = 576; /* == 288*2 */

/*-----------------------------------------------------------------------*/
/* playfield  */

const MAX_FRAMESKIP_COUNT = 4;

/*-----------------------------------------------------------------------*/
/* audio */

const PERIOD_MIN = 4;
const PERIOD_MIN_NONCE = 60;
const PERIOD_MAX = 0xffffffff;
