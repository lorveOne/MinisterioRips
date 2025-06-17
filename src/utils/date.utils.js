const moment = require('moment');

/**
 * Clase para manejar fechas
 * @class
 */
class DateUtils {
    static normalizeDate(date) {
        const formats = [
            'YYYY-MM-DD HH:mm:ss',
            'YYYY-MM-DDTHH:mm:ss.SSSZ',
            'YYYY-MM-DD HH:mm',
            'YYYY-MM-DD',
            'DD/MM/YYYY HH:mm:ss',
            'DD/MM/YYYY HH:mm',
            'DD/MM/YYYY',
            moment.ISO_8601
        ];
        
        return moment(date, formats, true).isValid() 
            ? moment(date, formats, true) 
            : moment(date);
    }

    static adjustDateToPeriod(originalDate, referenceDate, originalFormat) {
        const [time] = originalDate.includes(' ') ? originalDate.split(' ')[1].split(':') : ['00:00:00'];
        const [year, month, day] = referenceDate.split('-');
        
        return originalFormat.includes('/') 
            ? `${day}/${month}/${year} ${time}`
            : `${referenceDate} ${time}`;
    }

    static validateAndAdjustDate(date, index, serviceType, period) {
        try {
            const serviceDate = this.normalizeDate(date).local();
            const periodStart = moment(period.startDateTime).local();
            
            let periodEnd = moment(period.endDateTime).local();
            if (periodEnd.format('YYYY-MM-DD') !== period.endDate) {
                periodEnd = moment(period.endDate)
                    .set({ hour: 23, minute: 59, second: 59 })
                    .local();
            }

            if (!serviceDate.isValid()) {
                console.error(`❌ ${serviceType}[${index}] - Fecha inválida: ${date}`);
                return date;
            }

            if (serviceDate.isBefore(periodStart)) {
                console.log(`📅 ${serviceType}[${index}] - Fecha anterior al período`);
                return periodStart.format('YYYY-MM-DD HH:mm');
            } else if (serviceDate.isAfter(periodEnd)) {
                console.log(`📅 ${serviceType}[${index}] - Fecha posterior al período`);
                return periodEnd.format('YYYY-MM-DD HH:mm');
            }
            
            return serviceDate.format('YYYY-MM-DD HH:mm');
        } catch (error) {
            console.error(`💥 Error validando fecha en ${serviceType}[${index}]:`, error);
            return date;
        }
    }

    static parseDate(dateString) {
        try {
            let serviceDate;
            
            if (dateString.includes('/')) {
                const [datePart] = dateString.split(' ');
                const [day, month, year] = datePart.split('/');
                
                if (!day || !month || !year) {
                    throw new Error(`Formato DD/MM/YYYY incompleto: ${dateString}`);
                }
                
                serviceDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            } else {
                const datePart = dateString.split(' ')[0];
                serviceDate = new Date(datePart);
            }
            
            if (isNaN(serviceDate.getTime())) {
                throw new Error(`Fecha inválida: ${dateString}`);
            }
            
            return serviceDate;
        } catch (error) {
            console.error(`Error parseando fecha: ${dateString}`, error.message);
            return null;
        }
    }
}

module.exports = DateUtils; 